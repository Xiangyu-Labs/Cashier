import { db } from "@/lib/db";
import { postgresLedgerProjectionAdapter } from "./ledger-projections";
import type {
  BatchUpdateSourceDocumentsResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "@/modules/source-document/contract-schemas";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import { ConflictError } from "@/lib/errors";
import { postgresFxRateBook } from "./exchange-rate";
import { round } from "@/lib/money/decimal";

function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt))!;
}

function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(whereSourceDocumentNotDeleted(ledgerId), eq(sourceDocuments.id, sourceDocumentId))!;
}

interface UpdateSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentPayload;
}

interface BatchUpdateSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
  data: BatchUpdateSourceDocumentsPayload;
}

export async function updateSourceDocument({
  ledgerId,
  sourceDocumentId,
  data,
}: UpdateSourceDocumentInput): Promise<UpdateSourceDocumentResultDto> {
  const document = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });
  if (document == null) {
    return { sourceDocumentId, updated: false };
  }

  if (document.type === "manual" && document.activeRevisionId != null) {
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, ledgerId),
        eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: (entries, { asc }) => [asc(entries.createdAt), asc(entries.id)],
    });
    await postgresLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId,
      expectedActiveRevisionId: document.activeRevisionId,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
      entries: activeEntries.map((entry) => ({
        id: entry.id,
        categoryId: entry.categoryId,
        amount: entry.amount,
        currency: entry.currency,
        itemName: entry.itemName,
        description: entry.description,
        convertedAmount: entry.convertedAmount,
        exchangeRate: entry.exchangeRate,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
    return { sourceDocumentId, updated: true };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  // Use a source-document lock to serialise with concurrent delete / retry / accept / abandon.
  const updatedDocuments = await db.transaction(async (tx) => {
    await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    return tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
      .returning({ id: sourceDocuments.id });
  });

  return {
    sourceDocumentId,
    updated: updatedDocuments.length > 0,
  };
}

export async function batchUpdateSourceDocuments({
  ledgerId,
  sourceDocumentIds,
  data,
}: BatchUpdateSourceDocumentsInput): Promise<BatchUpdateSourceDocumentsResultDto> {
  if (sourceDocumentIds.length === 0) {
    return {
      sourceDocumentIds,
      updatedCount: 0,
    };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  const requestedIds = [...new Set(sourceDocumentIds)].sort();
  const initialLedger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    columns: { mainCurrency: true },
  });
  if (initialLedger == null) throw new ConflictError("Ledger changed before the batch edit");
  const initialEntries =
    data.entryDate === undefined
      ? []
      : await loadProjectionEntriesForDocuments(db, ledgerId, requestedIds);
  const conversions =
    data.entryDate === undefined
      ? []
      : await postgresFxRateBook.convertBatch(
          initialEntries.map((entry) => ({
            amount: entry.amount,
            from: entry.currency != null && entry.currency !== "" ? entry.currency : "CNY",
            to: initialLedger.mainCurrency,
            date: data.entryDate!,
          })),
          initialLedger.mainCurrency
        );
  const updatedDocuments = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, ledgerId);
    if (lockedLedger.mainCurrency !== initialLedger.mainCurrency) {
      throw new ConflictError("Ledger currency changed before the batch edit");
    }
    const documents = await tx
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, ledgerId),
          inArray(sourceDocuments.id, requestedIds),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .for("update");
    if (documents.length !== requestedIds.length) {
      throw new ConflictError("Source documents changed before the batch edit");
    }

    if (data.entryDate !== undefined) {
      const projectionEntries = await loadProjectionEntriesForDocuments(tx, ledgerId, requestedIds);
      if (
        projectionEntries.length !== initialEntries.length ||
        projectionEntries.some((entry, index) => {
          const initial = initialEntries[index];
          return (
            initial == null ||
            entry.id !== initial.id ||
            entry.amount !== initial.amount ||
            entry.currency !== initial.currency ||
            entry.sourceDocumentRevisionId !== initial.sourceDocumentRevisionId
          );
        })
      ) {
        throw new ConflictError("Ledger entries changed before the date update");
      }
      const changesJson = JSON.stringify(
        projectionEntries.map((entry, index) => ({
          id: entry.id,
          source_document_revision_id: entry.sourceDocumentRevisionId,
          converted_amount: round(conversions[index]!.convertedAmount, 2),
          exchange_rate: round(conversions[index]!.exchangeRate, 6),
        }))
      );
      const updatedEntries = await tx.execute(sql`
        WITH changes AS (
          SELECT * FROM jsonb_to_recordset(${changesJson}::jsonb) AS value(
            id uuid,
            source_document_revision_id uuid,
            converted_amount numeric,
            exchange_rate numeric
          )
        )
        UPDATE ledger_entries AS entry
        SET converted_amount = changes.converted_amount,
            exchange_rate = changes.exchange_rate,
            updated_at = ${new Date()}
        FROM changes
        WHERE entry.id = changes.id
          AND entry.ledger_id = ${ledgerId}
          AND entry.source_document_revision_id = changes.source_document_revision_id
          AND entry.deleted_at IS NULL
        RETURNING entry.id
      `);
      if (updatedEntries.rows.length !== projectionEntries.length) {
        throw new ConflictError("Ledger entries changed during the date update");
      }
    }

    const updated = await tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(
        and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, requestedIds))
      )
      .returning({ id: sourceDocuments.id });
    if (updated.length !== requestedIds.length) {
      throw new ConflictError("Source documents changed during the batch edit");
    }
    return updated;
  });

  return {
    sourceDocumentIds: requestedIds,
    updatedCount: updatedDocuments.length,
  };
}

type QueryExecutor = Pick<typeof db, "select">;

function loadProjectionEntriesForDocuments(
  executor: QueryExecutor,
  ledgerId: string,
  sourceDocumentIds: string[]
) {
  return executor
    .select({
      id: ledgerEntries.id,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt),
        or(
          eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.activeRevisionId),
          eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.pendingRevisionId)
        )
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .orderBy(ledgerEntries.id);
}
