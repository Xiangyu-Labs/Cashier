import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { LedgerProjectionEntryContract } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { ledgerEntries, ledgers, sourceDocumentRevisions, sourceDocuments } from "@/persistence";
import type { SplitSourceDocumentResultDto } from "@/modules/source-document/contracts";
import { postgresFxRateBook } from "./exchange-rate";
import {
  createManualProjectionInTransaction,
  replaceActiveProjectionInTransaction,
} from "./ledger-projections";
import { listLedgerEntryViewsBySourceDocumentIds } from "./ledger-reads/list-ledger-entry-views-by-source-document-ids";
import { getTargetSourceDocument } from "./read-models";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";

interface SplitSourceDocumentAdapterInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedRevisionId: string;
  operationId: string;
  newSourceDocumentId: string;
  ledgerEntryIds: string[];
  entryDate: string;
}

type EntrySnapshot = typeof ledgerEntries.$inferSelect;

function splitRevisionId(input: SplitSourceDocumentAdapterInput): string {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        ledgerId: input.ledgerId,
        sourceDocumentId: input.sourceDocumentId,
        expectedRevisionId: input.expectedRevisionId,
        operationId: input.operationId,
        newSourceDocumentId: input.newSourceDocumentId,
        ledgerEntryIds: [...input.ledgerEntryIds].sort(),
        entryDate: input.entryDate,
      })
    )
    .digest();
  fingerprint[6] = (fingerprint[6]! & 0x0f) | 0x40;
  fingerprint[8] = (fingerprint[8]! & 0x3f) | 0x80;
  const hex = fingerprint.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function normalizeCurrency(currency: string | null): string {
  return currency != null && currency !== "" ? currency : "CNY";
}

function effectiveTitle(documentTitle: string | null, revisionTitle: string | null): string | null {
  return documentTitle?.trim() || revisionTitle?.trim() || null;
}

function sameEntries(
  expected: readonly EntrySnapshot[],
  actual: readonly EntrySnapshot[]
): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((entry, index) => {
    const current = actual[index];
    return (
      current != null &&
      entry.id === current.id &&
      entry.sourceDocumentRevisionId === current.sourceDocumentRevisionId &&
      entry.position === current.position &&
      entry.categoryId === current.categoryId &&
      entry.amount === current.amount &&
      entry.currency === current.currency &&
      entry.itemName === current.itemName &&
      entry.description === current.description &&
      entry.convertedAmount === current.convertedAmount &&
      entry.exchangeRate === current.exchangeRate &&
      entry.createdAt.getTime() === current.createdAt.getTime()
    );
  });
}

function projectionEntry(
  entry: EntrySnapshot,
  overrides?: { id?: string; convertedAmount?: string; exchangeRate?: string }
): LedgerProjectionEntryContract {
  return {
    id: overrides?.id ?? entry.id,
    categoryId: entry.categoryId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: overrides?.convertedAmount ?? entry.convertedAmount,
    exchangeRate: overrides?.exchangeRate ?? entry.exchangeRate,
    createdAt: entry.createdAt.toISOString(),
  };
}

async function loadResult(
  input: SplitSourceDocumentAdapterInput,
  sourceRevisionId: string,
  splitRevisionId: string
): Promise<SplitSourceDocumentResultDto> {
  const [sourceDocument, splitSourceDocument, entries] = await Promise.all([
    getTargetSourceDocument(input.ledgerId, input.sourceDocumentId),
    getTargetSourceDocument(input.ledgerId, input.newSourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds({
      ledgerId: input.ledgerId,
      sourceDocumentIds: [input.sourceDocumentId, input.newSourceDocumentId],
      includeDuplicatePending: true,
    }),
  ]);
  if (sourceDocument == null || splitSourceDocument == null) {
    throw new ConflictError("Split source document result is incomplete");
  }
  const movedEntries = entries.get(input.newSourceDocumentId) ?? [];
  if (movedEntries.length !== input.ledgerEntryIds.length) {
    throw new ConflictError("Split request does not match the completed operation");
  }
  return {
    sourceDocumentId: input.sourceDocumentId,
    sourceDocumentActiveRevisionId: sourceRevisionId,
    splitSourceDocumentId: input.newSourceDocumentId,
    splitSourceDocumentActiveRevisionId: splitRevisionId,
    movedEntryCount: movedEntries.length,
    sourceDocument: {
      ...sourceDocument,
      activeRevisionId: sourceRevisionId,
      ledgerEntries: entries.get(input.sourceDocumentId) ?? [],
    },
    splitSourceDocument: {
      ...splitSourceDocument,
      activeRevisionId: splitRevisionId,
      ledgerEntries: movedEntries,
    },
  };
}

export async function splitSourceDocumentAtomically(
  input: SplitSourceDocumentAdapterInput
): Promise<SplitSourceDocumentResultDto> {
  const expectedSplitRevisionId = splitRevisionId(input);
  const [
    ledger,
    document,
    activeRevision,
    initialEntries,
    existingSplitDocument,
    existingOperationRevision,
  ] = await Promise.all([
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
    db.query.sourceDocumentRevisions.findFirst({
      where: and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
        eq(sourceDocumentRevisions.id, input.expectedRevisionId)
      ),
    }),
    db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.expectedRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: [asc(ledgerEntries.position), asc(ledgerEntries.id)],
    }),
    db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, input.newSourceDocumentId),
      columns: { activeRevisionId: true, entryDate: true },
    }),
    db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, input.operationId),
      columns: { id: true },
    }),
  ]);

  if (ledger == null || document == null) throw new NotFoundError("Source document");
  if (document.activeRevisionId === input.operationId) {
    if (
      existingSplitDocument?.activeRevisionId !== expectedSplitRevisionId ||
      existingSplitDocument.entryDate !== input.entryDate
    ) {
      throw new ConflictError("Split operation identifiers do not match");
    }
    return loadResult(input, input.operationId, expectedSplitRevisionId);
  }
  if (existingSplitDocument != null) throw new ConflictError("Source document already exists");
  if (existingOperationRevision != null) throw new ConflictError("Revision already exists");
  if (
    document.activeRevisionId !== input.expectedRevisionId ||
    document.pendingRevisionId != null ||
    document.currentStatus !== "completed" ||
    activeRevision?.outcome !== "completed"
  ) {
    throw new ConflictError("Source document cannot be split in its current state");
  }

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
      to: ledger.mainCurrency,
      date: input.entryDate,
    })),
    ledger.mainCurrency
  );

  const transactionResult = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    if (lockedLedger.mainCurrency !== ledger.mainCurrency) {
      throw new ConflictError("Ledger currency changed before the split");
    }
    const lockedDocument = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.sourceDocumentId
    );
    if (lockedDocument.activeRevisionId === input.operationId) {
      const retriedSplit = await tx.query.sourceDocuments.findFirst({
        where: and(
          eq(sourceDocuments.id, input.newSourceDocumentId),
          eq(sourceDocuments.ledgerId, input.ledgerId),
          isNull(sourceDocuments.deletedAt)
        ),
        columns: { activeRevisionId: true, entryDate: true },
      });
      if (
        retriedSplit?.activeRevisionId !== expectedSplitRevisionId ||
        retriedSplit.entryDate !== input.entryDate
      ) {
        throw new ConflictError("Split operation identifiers do not match");
      }
      return {
        sourceRevisionId: input.operationId,
        splitRevisionId: retriedSplit.activeRevisionId,
      };
    }
    if (
      lockedDocument.activeRevisionId !== input.expectedRevisionId ||
      lockedDocument.pendingRevisionId != null ||
      lockedDocument.currentStatus !== "completed"
    ) {
      throw new ConflictError("Source document changed before the split");
    }

    const lockedRevision = await tx.query.sourceDocumentRevisions.findFirst({
      where: and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
        eq(sourceDocumentRevisions.id, input.expectedRevisionId),
        eq(sourceDocumentRevisions.outcome, "completed")
      ),
    });
    const currentEntries = await tx.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.expectedRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: [asc(ledgerEntries.position), asc(ledgerEntries.id)],
    });
    const splitCollision = await tx.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, input.newSourceDocumentId),
      columns: { id: true },
    });
    const operationCollision = await tx.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, input.operationId),
      columns: { id: true },
    });
    if (lockedRevision == null || !sameEntries(initialEntries, currentEntries)) {
      throw new ConflictError("Source document entries changed before the split");
    }
    if (splitCollision != null) throw new ConflictError("Source document already exists");
    if (operationCollision != null) throw new ConflictError("Revision already exists");

    const currentSelected = currentEntries.filter((entry) => selectedIds.has(entry.id));
    if (
      currentSelected.length !== selectedIds.size ||
      currentSelected.length >= currentEntries.length
    ) {
      throw new ConflictError("Selected entries changed before the split");
    }
    const remainingEntries = currentEntries
      .filter((entry) => !selectedIds.has(entry.id))
      .map((entry) => projectionEntry(entry));
    const sourceRevisionId = await replaceActiveProjectionInTransaction(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      expectedActiveRevisionId: input.expectedRevisionId,
      revisionId: input.operationId,
      entries: remainingEntries,
    });

    const splitEntries = currentSelected.map((entry, index) =>
      projectionEntry(entry, {
        id: crypto.randomUUID(),
        convertedAmount: round(conversions[index]!.convertedAmount, 2),
        exchangeRate: round(conversions[index]!.exchangeRate, 6),
      })
    );
    const splitRevisionId = await createManualProjectionInTransaction(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.newSourceDocumentId,
      revisionId: expectedSplitRevisionId,
      title: effectiveTitle(lockedDocument.title, lockedRevision.title),
      entryDate: input.entryDate,
      submittedText: lockedRevision.submittedText,
      copyFilesFromRevisionId: input.expectedRevisionId,
      entries: splitEntries,
    });
    return { sourceRevisionId, splitRevisionId };
  });

  return loadResult(input, transactionResult.sourceRevisionId, transactionResult.splitRevisionId);
}
