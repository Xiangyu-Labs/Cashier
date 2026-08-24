import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresTransaction } from "./transaction-locks";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import { replaceActiveProjectionInTransaction } from "./ledger-projections";
import { postgresFxRateBook } from "./exchange-rate";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { AppError, NotFoundError } from "@/lib/errors";
import { entryCategories, ledgerEntries, revisionFiles } from "@/persistence";
import { mapLedgerEntryDto } from "./ledger-reads/mappers";
import type { DeleteLedgerEntryResultDto, LedgerEntryDto } from "@/modules/ledger/contracts";
import type { LedgerProjectionEntryContract } from "@/application/contracts";

type CreateCommand = {
  ledgerId: string;
  ledgerEntryId: string;
  amount: string;
  currency?: string;
  itemName: string;
  categoryId?: string;
  description?: string | null;
  sourceDocumentId: string;
};

type UpdateCommand = {
  ledgerId: string;
  ledgerEntryId: string;
  categoryId?: string | null;
  amount?: string;
  currency?: string | null;
  itemName?: string;
  description?: string | null;
};

async function assertCategoryOwnership(
  tx: PostgresTransaction,
  ledgerId: string,
  categoryId: string | null | undefined
) {
  if (categoryId == null) return;
  const category = await tx
    .select({ id: entryCategories.id })
    .from(entryCategories)
    .where(
      and(
        eq(entryCategories.ledgerId, ledgerId),
        eq(entryCategories.id, categoryId),
        isNull(entryCategories.deletedAt)
      )
    )
    .then((rows) => rows[0]);
  if (category == null) throw new NotFoundError("Category");
}

async function listProjectionEntries(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string
) {
  return tx.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
      eq(ledgerEntries.sourceDocumentRevisionId, revisionId),
      isNull(ledgerEntries.deletedAt)
    ),
    orderBy: (entries, { asc }) => [asc(entries.position), asc(entries.id)],
  });
}

function toProjectionEntry(
  entry: typeof ledgerEntries.$inferSelect
): LedgerProjectionEntryContract {
  return {
    id: entry.id,
    categoryId: entry.categoryId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate: entry.exchangeRate,
    createdAt: entry.createdAt.toISOString(),
  };
}

async function getEntryInTransaction(
  tx: PostgresTransaction,
  ledgerId: string,
  ledgerEntryId: string
): Promise<LedgerEntryDto | null> {
  const entry = await tx.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      eq(ledgerEntries.id, ledgerEntryId),
      isNull(ledgerEntries.deletedAt),
      sql`EXISTS (
        SELECT 1 FROM source_documents active_document
        WHERE active_document.ledger_id = ${ledgerEntries.ledgerId}
          AND active_document.id = ${ledgerEntries.sourceDocumentId}
          AND active_document.deleted_at IS NULL
          AND active_document.active_revision_id = ${ledgerEntries.sourceDocumentRevisionId}
      )`
    ),
    with: {
      category: true,
      sourceDocument: {
        columns: {
          id: true,
          ledgerId: true,
          title: true,
          currentStatus: true,
          type: true,
          entryDate: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      },
    },
  });
  if (entry == null) return null;
  const dto = mapLedgerEntryDto({
    ...entry,
    category: entry.category,
    sourceDocument: entry.sourceDocument,
  });
  if (dto.sourceDocument != null && entry.sourceDocumentRevisionId != null) {
    const file = await tx
      .select({ id: revisionFiles.id })
      .from(revisionFiles)
      .where(eq(revisionFiles.revisionId, entry.sourceDocumentRevisionId))
      .limit(1)
      .then((rows) => rows[0]);
    dto.sourceDocument = { ...dto.sourceDocument, hasImages: file != null };
  }
  return dto;
}

async function replaceProjection(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    activeRevisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
) {
  await replaceActiveProjectionInTransaction(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    expectedActiveRevisionId: input.activeRevisionId,
    revisionId: crypto.randomUUID(),
    entries: input.entries,
  });
}

export async function createLedgerEntryInTransaction(
  tx: PostgresTransaction,
  input: CreateCommand
): Promise<LedgerEntryDto> {
  const replay = await getEntryInTransaction(tx, input.ledgerId, input.ledgerEntryId);
  if (replay != null) return replay;
  const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
  const document = await lockSourceDocumentForUpdate(tx, input.ledgerId, input.sourceDocumentId);
  if (document.activeRevisionId == null) throw new NotFoundError("Active source document");
  await assertCategoryOwnership(tx, input.ledgerId, input.categoryId);
  const effectiveCurrency = input.currency ?? ledger.mainCurrency;
  const conversion = await convertEntryAmount(
    {
      amount: input.amount,
      fromCurrency: effectiveCurrency,
      toCurrency: ledger.mainCurrency,
      ...(document.entryDate != null ? { date: document.entryDate } : {}),
    },
    postgresFxRateBook
  );
  const entries = await listProjectionEntries(
    tx,
    input.ledgerId,
    document.id,
    document.activeRevisionId
  );
  await replaceProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: document.id,
    activeRevisionId: document.activeRevisionId,
    entries: [
      ...entries.map(toProjectionEntry),
      {
        id: input.ledgerEntryId,
        categoryId: input.categoryId ?? null,
        amount: roundToCurrency(input.amount, effectiveCurrency),
        currency: input.currency ?? effectiveCurrency,
        itemName: input.itemName,
        description: input.description ?? null,
        convertedAmount: conversion?.convertedAmount ?? null,
        exchangeRate: conversion?.exchangeRate ?? null,
      },
    ],
  });
  const created = await getEntryInTransaction(tx, input.ledgerId, input.ledgerEntryId);
  if (created == null) throw new AppError("Failed to create ledger entry", "ENTRY_CREATE_FAILED");
  return created;
}

export async function updateLedgerEntryInTransaction(
  tx: PostgresTransaction,
  input: UpdateCommand
): Promise<LedgerEntryDto> {
  const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
  const target = await tx.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.ledgerId, input.ledgerId),
      eq(ledgerEntries.id, input.ledgerEntryId),
      isNull(ledgerEntries.deletedAt)
    ),
  });
  if (target?.sourceDocumentId == null) throw new NotFoundError("Active ledger entry projection");
  const document = await lockSourceDocumentForUpdate(tx, input.ledgerId, target.sourceDocumentId);
  if (
    document.activeRevisionId == null ||
    target.sourceDocumentRevisionId !== document.activeRevisionId
  ) {
    throw new NotFoundError("Active ledger entry projection");
  }
  await assertCategoryOwnership(tx, input.ledgerId, input.categoryId);
  const nextCurrency = input.currency !== undefined ? input.currency : target.currency;
  const effectiveCurrency = nextCurrency ?? ledger.mainCurrency;
  const nextAmount = input.amount ?? target.amount;
  let convertedAmount = target.convertedAmount;
  let exchangeRate = target.exchangeRate;
  if (input.amount !== undefined || input.currency !== undefined) {
    const conversion = await convertEntryAmount(
      {
        amount: nextAmount,
        fromCurrency: effectiveCurrency,
        toCurrency: ledger.mainCurrency,
        ...(document.entryDate != null ? { date: document.entryDate } : {}),
      },
      postgresFxRateBook
    );
    convertedAmount = conversion?.convertedAmount ?? null;
    exchangeRate = conversion?.exchangeRate ?? null;
  }
  const entries = await listProjectionEntries(
    tx,
    input.ledgerId,
    document.id,
    document.activeRevisionId
  );
  await replaceProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: document.id,
    activeRevisionId: document.activeRevisionId,
    entries: entries.map((entry) =>
      entry.id === input.ledgerEntryId
        ? {
            ...toProjectionEntry(entry),
            categoryId: input.categoryId !== undefined ? input.categoryId : entry.categoryId,
            amount:
              input.amount !== undefined || input.currency !== undefined
                ? roundToCurrency(nextAmount, effectiveCurrency)
                : entry.amount,
            currency: input.currency !== undefined ? effectiveCurrency : entry.currency,
            itemName: input.itemName !== undefined ? input.itemName : entry.itemName,
            description: input.description !== undefined ? input.description : entry.description,
            convertedAmount,
            exchangeRate,
          }
        : toProjectionEntry(entry)
    ),
  });
  const updated = await getEntryInTransaction(tx, input.ledgerId, input.ledgerEntryId);
  if (updated == null) throw new NotFoundError("Entry");
  return updated;
}

export async function deleteLedgerEntryInTransaction(
  tx: PostgresTransaction,
  input: { ledgerId: string; ledgerEntryId: string }
): Promise<DeleteLedgerEntryResultDto> {
  await lockLedgerForUpdate(tx, input.ledgerId);
  const target = await tx.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.ledgerId, input.ledgerId),
      eq(ledgerEntries.id, input.ledgerEntryId),
      isNull(ledgerEntries.deletedAt)
    ),
  });
  if (target?.sourceDocumentId == null) {
    return { ledgerEntryId: input.ledgerEntryId, deleted: false };
  }
  const document = await lockSourceDocumentForUpdate(tx, input.ledgerId, target.sourceDocumentId);
  if (
    document.activeRevisionId == null ||
    target.sourceDocumentRevisionId !== document.activeRevisionId
  ) {
    return { ledgerEntryId: input.ledgerEntryId, deleted: false };
  }
  const entries = await listProjectionEntries(
    tx,
    input.ledgerId,
    document.id,
    document.activeRevisionId
  );
  await replaceProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: document.id,
    activeRevisionId: document.activeRevisionId,
    entries: entries.filter((entry) => entry.id !== input.ledgerEntryId).map(toProjectionEntry),
  });
  return {
    ledgerEntryId: input.ledgerEntryId,
    deleted: true,
    sourceDocumentId: document.id,
  };
}
