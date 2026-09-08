import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { ledgerEntries, ledgers, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import type {
  SplitSourceDocumentResultDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
import { postgresFxRateBook } from "./exchange-rate";
import { copyRevisionFiles, createCompletedRevision } from "./ledger-projections";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";

type EntrySnapshot = typeof ledgerEntries.$inferSelect;

function normalizeCurrency(currency: string | null): string {
  return currency != null && currency !== "" ? currency : "CNY";
}

function effectiveTitle(documentTitle: string | null, revisionTitle: string | null): string | null {
  return documentTitle?.trim() || revisionTitle?.trim() || null;
}

function sameEntries(expected: readonly EntrySnapshot[], actual: readonly EntrySnapshot[]) {
  if (expected.length !== actual.length) return false;
  return expected.every((entry, index) => {
    const current = actual[index];
    return (
      current != null &&
      entry.id === current.id &&
      entry.position === current.position &&
      entry.categoryId === current.categoryId &&
      entry.amount === current.amount &&
      entry.currency === current.currency &&
      entry.itemName === current.itemName &&
      entry.description === current.description &&
      entry.convertedAmount === current.convertedAmount &&
      entry.exchangeRate === current.exchangeRate
    );
  });
}

export async function splitSourceDocumentAtomically(input: {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
  ledgerEntryIds: string[];
  entryDate: string;
}): Promise<VersionedCommandResult<SplitSourceDocumentResultDto>> {
  const [ledger, document] = await Promise.all([
    db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, input.ledgerId), isNull(ledgers.deletedAt)),
      columns: { mainCurrency: true },
    }),
    db.query.sourceDocuments.findFirst({
      where: and(
        eq(sourceDocuments.ledgerId, input.ledgerId),
        eq(sourceDocuments.id, input.sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      ),
    }),
  ]);
  if (ledger == null || document == null) throw new NotFoundError("Source document");
  if (document.stateVersion !== input.expectedVersion) {
    return {
      ok: false,
      reason: "stale",
      sourceDocumentId: input.sourceDocumentId,
      expectedVersion: input.expectedVersion,
      currentVersion: document.stateVersion,
    };
  }
  if (
    document.activeRevisionId == null ||
    document.pendingRevisionId != null ||
    document.currentStatus !== "completed"
  ) {
    throw new ConflictError("Source document cannot be split in its current state");
  }
  const initialEntries = await db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, input.ledgerId),
      eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
      eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
      isNull(ledgerEntries.deletedAt)
    ),
    orderBy: [asc(ledgerEntries.position), asc(ledgerEntries.id)],
  });
  const selectedIds = new Set(input.ledgerEntryIds);
  const movedEntries = initialEntries.filter((entry) => selectedIds.has(entry.id));
  if (movedEntries.length !== selectedIds.size) {
    throw new ConflictError("Selected entries are not in the active source document revision");
  }
  if (movedEntries.length >= initialEntries.length) {
    throw new ConflictError("The source document must retain at least one entry");
  }
  const conversions = await postgresFxRateBook.convertBatch(
    movedEntries.map((entry) => ({
      amount: entry.amount,
      from: normalizeCurrency(entry.currency),
      date: input.entryDate,
    })),
    ledger.mainCurrency
  );
  const movedIndexById = new Map(movedEntries.map((entry, index) => [entry.id, index]));

  const splitSourceDocumentId = crypto.randomUUID();
  const outcome = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    const lockedDocument = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.sourceDocumentId
    );
    if (lockedDocument.stateVersion !== input.expectedVersion) {
      return { staleVersion: lockedDocument.stateVersion } as const;
    }
    if (
      lockedLedger.mainCurrency !== ledger.mainCurrency ||
      lockedDocument.activeRevisionId == null ||
      lockedDocument.pendingRevisionId != null ||
      lockedDocument.currentStatus !== "completed"
    ) {
      throw new ConflictError("Source document changed before the split");
    }
    const activeRevision = await tx.query.sourceDocumentRevisions.findFirst({
      where: and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
        eq(sourceDocumentRevisions.id, lockedDocument.activeRevisionId),
        eq(sourceDocumentRevisions.outcome, "completed")
      ),
    });
    if (activeRevision == null) throw new ConflictError("Active revision is not completed");
    const currentEntries = await tx.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, lockedDocument.activeRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: [asc(ledgerEntries.position), asc(ledgerEntries.id)],
    });
    if (!sameEntries(initialEntries, currentEntries)) {
      throw new ConflictError("Source document entries changed before the split");
    }

    const sourceRevision = await createCompletedRevision(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      submittedText: activeRevision.submittedText,
    });
    await tx.insert(sourceDocuments).values({
      id: splitSourceDocumentId,
      ledgerId: input.ledgerId,
      title: effectiveTitle(lockedDocument.title, activeRevision.title),
      type: lockedDocument.type,
      currentStatus: "completed",
      stateVersion: 1,
      entryDate: input.entryDate,
    });
    const splitRevision = await createCompletedRevision(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: splitSourceDocumentId,
      submittedText: activeRevision.submittedText,
    });
    await copyRevisionFiles(tx, {
      ledgerId: input.ledgerId,
      fromRevisionId: activeRevision.id,
      toRevisionId: sourceRevision.id,
    });
    await copyRevisionFiles(tx, {
      ledgerId: input.ledgerId,
      fromRevisionId: activeRevision.id,
      toRevisionId: splitRevision.id,
    });

    const now = new Date();
    let sourcePosition = 0;
    let splitPosition = 0;
    const entryPatches = currentEntries.map((entry) => {
      const movedIndex = movedIndexById.get(entry.id);
      const isMoved = movedIndex != null;
      return {
        id: entry.id,
        source_document_id: isMoved ? splitSourceDocumentId : input.sourceDocumentId,
        source_document_revision_id: isMoved ? splitRevision.id : sourceRevision.id,
        position: isMoved ? splitPosition++ : sourcePosition++,
        converted_amount: isMoved
          ? roundToCurrency(conversions[movedIndex]!.convertedAmount, lockedLedger.mainCurrency)
          : entry.convertedAmount,
        exchange_rate: isMoved
          ? round(conversions[movedIndex]!.exchangeRate, 12)
          : entry.exchangeRate,
      };
    });
    const updatedEntries = await tx.execute(sql`
      WITH patches AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(entryPatches)}::jsonb) AS value(
          id uuid,
          source_document_id uuid,
          source_document_revision_id uuid,
          position integer,
          converted_amount numeric,
          exchange_rate numeric
        )
      )
      UPDATE ledger_entries AS entry
      SET source_document_id = patches.source_document_id,
          source_document_revision_id = patches.source_document_revision_id,
          position = patches.position,
          converted_amount = patches.converted_amount,
          exchange_rate = patches.exchange_rate,
          updated_at = ${now}
      FROM patches
      WHERE entry.id = patches.id
        AND entry.ledger_id = ${input.ledgerId}
        AND entry.deleted_at IS NULL
      RETURNING entry.id
    `);
    if (updatedEntries.rows.length !== currentEntries.length) {
      throw new ConflictError("Source document entries changed during the split");
    }
    if (currentEntries.length > 0) {
      await tx.insert(ledgerEntries).values(
        currentEntries.map((entry) => ({
          ...entry,
          id: crypto.randomUUID(),
          deletedAt: now,
          updatedAt: now,
        }))
      );
    }
    await tx
      .update(sourceDocuments)
      .set({
        activeRevisionId: sourceRevision.id,
        pendingRevisionId: null,
        currentStatus: "completed",
        stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(sourceDocuments.ledgerId, input.ledgerId),
          eq(sourceDocuments.id, input.sourceDocumentId),
          eq(sourceDocuments.stateVersion, input.expectedVersion)
        )
      );
    await tx
      .update(sourceDocuments)
      .set({ activeRevisionId: splitRevision.id, pendingRevisionId: null, updatedAt: now })
      .where(
        and(
          eq(sourceDocuments.ledgerId, input.ledgerId),
          eq(sourceDocuments.id, splitSourceDocumentId)
        )
      );
    return { movedEntryCount: movedEntries.length } as const;
  });

  if ("staleVersion" in outcome) {
    return {
      ok: false,
      reason: "stale",
      sourceDocumentId: input.sourceDocumentId,
      expectedVersion: input.expectedVersion,
      currentVersion: outcome.staleVersion,
    };
  }
  return {
    ok: true,
    sourceDocumentId: input.sourceDocumentId,
    version: input.expectedVersion + 1,
    data: {
      splitSourceDocumentId,
      splitVersion: 1,
      movedEntryCount: outcome.movedEntryCount,
    },
  };
}
