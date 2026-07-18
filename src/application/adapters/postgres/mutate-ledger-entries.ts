import { and, eq, isNull } from "drizzle-orm";
import {
  ensureTargetLedgerProjection,
  postgresLedgerProjectionAdapter,
} from "@/application/adapters/postgres/ledger-projections";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import { getLedgerMainCurrency } from "@/modules/ledger/application/queries/get-ledger-main-currency";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { getLedgerEntryDetail } from "./ledger-reads/get-ledger-entry-detail";

function normalizeCurrency(value: string | null | undefined): string {
  return value != null && value !== "" ? value : "CNY";
}

function whereActiveSourceDocumentForLedger(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    eq(sourceDocuments.ledgerId, ledgerId),
    isNull(sourceDocuments.deletedAt)
  )!;
}

export async function createLedgerEntryWithConversion(input: {
  ledgerId: string;
  amount: string;
  currency?: string;
  itemName: string;
  categoryId?: string;
  description?: string | null;
  sourceDocumentId: string;
}): Promise<LedgerEntryDto> {
  const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const entryCurrency = normalizeCurrency(input.currency);

  let sourceDoc = await db.query.sourceDocuments.findFirst({
    where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
    columns: { activeRevisionId: true, entryDate: true },
  });

  if (sourceDoc == null) {
    throw new NotFoundError("Source document");
  }

  const entryDate =
    sourceDoc.entryDate != null && sourceDoc.entryDate !== "" ? sourceDoc.entryDate : undefined;

  const conversion = await convertEntryAmount({
    amount: input.amount,
    fromCurrency: entryCurrency,
    toCurrency: mainCurrency,
    ...(entryDate !== undefined ? { date: entryDate } : {}),
  });

  if (sourceDoc.activeRevisionId == null) {
    await ensureTargetLedgerProjection(input.ledgerId, input.sourceDocumentId);
    sourceDoc = await db.query.sourceDocuments.findFirst({
      where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
      columns: { activeRevisionId: true, entryDate: true },
    });
  }
  if (sourceDoc?.activeRevisionId == null) throw new NotFoundError("Active source document");
  const activeEntries = await listActiveProjectionEntries(
    input.ledgerId,
    input.sourceDocumentId,
    sourceDoc.activeRevisionId
  );
  const ledgerEntryId = crypto.randomUUID();
  await postgresLedgerProjectionAdapter.replaceActive({
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    expectedActiveRevisionId: sourceDoc.activeRevisionId,
    entries: [
      ...activeEntries.map(toProjectionEntry),
      {
        id: ledgerEntryId,
        amount: round(String(input.amount), 2),
        itemName: input.itemName,
        currency: entryCurrency,
        categoryId: input.categoryId ?? null,
        description: input.description ?? null,
        convertedAmount: conversion?.convertedAmount ?? null,
        exchangeRate: conversion?.exchangeRate ?? null,
      },
    ],
  });
  const created = await getLedgerEntryDetail(ledgerEntryId, input.ledgerId);
  if (created == null) throw new AppError("Failed to create ledger entry", "ENTRY_CREATE_FAILED");
  return created;
}

type ActiveProjectionEntry = typeof ledgerEntries.$inferSelect;

function toProjectionEntry(entry: ActiveProjectionEntry) {
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

async function listActiveProjectionEntries(
  ledgerId: string,
  sourceDocumentId: string,
  activeRevisionId: string
): Promise<ActiveProjectionEntry[]> {
  return db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
      eq(ledgerEntries.sourceDocumentRevisionId, activeRevisionId),
      isNull(ledgerEntries.deletedAt)
    ),
    orderBy: (entries, { asc }) => [asc(entries.createdAt), asc(entries.id)],
  });
}

export async function updateLedgerEntryWithConversion(input: {
  ledgerId: string;
  ledgerEntryId: string;
  categoryId?: string | null;
  amount?: string;
  currency?: string | null;
  itemName?: string;
  description?: string | null;
}): Promise<LedgerEntryDto> {
  let targetEntry = await db.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.id, input.ledgerEntryId),
      eq(ledgerEntries.ledgerId, input.ledgerId),
      isNull(ledgerEntries.deletedAt)
    ),
    with: { sourceDocument: true },
  });
  if (targetEntry?.sourceDocument != null && targetEntry.sourceDocument.activeRevisionId == null) {
    await ensureTargetLedgerProjection(input.ledgerId, targetEntry.sourceDocument.id);
    targetEntry = await db.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.id, input.ledgerEntryId),
        eq(ledgerEntries.ledgerId, input.ledgerId),
        isNull(ledgerEntries.deletedAt)
      ),
      with: { sourceDocument: true },
    });
  }
  const targetDocument = targetEntry?.sourceDocument;
  if (
    targetEntry == null ||
    targetDocument == null ||
    targetDocument.activeRevisionId == null ||
    targetEntry.sourceDocumentRevisionId !== targetDocument.activeRevisionId
  ) {
    throw new NotFoundError("Active ledger entry projection");
  }
  const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const nextAmount = input.amount ?? targetEntry.amount;
  const nextCurrency = normalizeCurrency(input.currency ?? targetEntry.currency);
  let convertedAmount = targetEntry.convertedAmount;
  let exchangeRate = targetEntry.exchangeRate;
  if (input.amount !== undefined || input.currency !== undefined) {
    const conversion = await convertEntryAmount({
      amount: nextAmount,
      fromCurrency: nextCurrency,
      toCurrency: mainCurrency,
      ...(targetDocument.entryDate != null && targetDocument.entryDate !== ""
        ? { date: targetDocument.entryDate }
        : {}),
    });
    convertedAmount = conversion?.convertedAmount ?? null;
    exchangeRate = conversion?.exchangeRate ?? null;
  }
  const activeEntries = await listActiveProjectionEntries(
    input.ledgerId,
    targetDocument.id,
    targetDocument.activeRevisionId
  );
  await postgresLedgerProjectionAdapter.replaceActive({
    ledgerId: input.ledgerId,
    sourceDocumentId: targetDocument.id,
    expectedActiveRevisionId: targetDocument.activeRevisionId,
    entries: activeEntries.map((entry) =>
      entry.id === input.ledgerEntryId
        ? {
            ...toProjectionEntry(entry),
            categoryId: input.categoryId !== undefined ? input.categoryId : entry.categoryId,
            amount: input.amount !== undefined ? round(String(input.amount), 2) : entry.amount,
            currency: input.currency !== undefined ? input.currency : entry.currency,
            itemName: input.itemName !== undefined ? input.itemName : entry.itemName,
            description: input.description !== undefined ? input.description : entry.description,
            convertedAmount,
            exchangeRate,
          }
        : toProjectionEntry(entry)
    ),
  });
  const updated = await getLedgerEntryDetail(input.ledgerEntryId, input.ledgerId);
  if (updated == null) throw new NotFoundError("Entry");
  return updated;
}

export async function batchUpdateLedgerEntries(input: {
  ledgerId: string;
  ledgerEntryIds: string[];
  categoryId?: string | null;
  currency?: string | null;
  amount?: string;
  description?: string | null;
  itemName?: string;
}): Promise<number> {
  let affectedCount = 0;
  for (const ledgerEntryId of input.ledgerEntryIds) {
    await updateLedgerEntryWithConversion({
      ledgerId: input.ledgerId,
      ledgerEntryId,
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.itemName !== undefined ? { itemName: input.itemName } : {}),
    });
    affectedCount += 1;
  }
  return affectedCount;
}
