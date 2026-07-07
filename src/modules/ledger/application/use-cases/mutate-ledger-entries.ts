import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { logger } from "@/lib/logger";
import { AppError, NotFoundError } from "@/lib/errors";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import { mapLedgerEntryDto } from "../mappers";
import { getLedgerMainCurrency } from "../queries/get-ledger-main-currency";
import { recalculateEntriesConvertedAmount } from "../services/recalculate-entries-converted-amount";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import type { LedgerEntryDto } from "../../contracts";

function normalizeCurrency(value: string | null | undefined): string {
  return value != null && value !== "" ? value : "CNY";
}

function applyLedgerEntryPatch(
  data: {
    categoryId?: string | null;
    amount?: number;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  },
  now: Date
): Partial<{
  categoryId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  updatedAt: Date;
  convertedAmount: string;
  exchangeRate: string;
}> {
  const patch: Partial<{
    categoryId: string | null;
    amount: string;
    currency: string | null;
    itemName: string;
    description: string | null;
    updatedAt: Date;
    convertedAmount: string;
    exchangeRate: string;
  }> = { updatedAt: now };

  if (data.categoryId !== undefined) patch.categoryId = data.categoryId;
  if (data.amount !== undefined) patch.amount = data.amount.toFixed(2);
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.itemName !== undefined) patch.itemName = data.itemName;
  if (data.description !== undefined) patch.description = data.description;

  return patch;
}

function whereActiveSourceDocumentForLedger(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    eq(sourceDocuments.ledgerId, ledgerId),
    ne(sourceDocuments.status, "deleted")
  )!;
}

export async function createLedgerEntryWithConversion(input: {
  ledgerId: string;
  amount: number;
  currency?: string;
  itemName: string;
  categoryId?: string;
  description?: string | null;
  sourceDocumentId: string;
}): Promise<LedgerEntryDto> {
  const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const entryCurrency = normalizeCurrency(input.currency);

  const sourceDoc = await db.query.sourceDocuments.findFirst({
    where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
    columns: { entryDate: true },
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

  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      amount: input.amount.toFixed(2),
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      itemName: input.itemName,
      currency: entryCurrency,
      categoryId: input.categoryId,
      description: input.description,
      convertedAmount: conversion?.convertedAmount ?? null,
      exchangeRate: conversion?.exchangeRate ?? null,
    })
    .returning();

  if (entry == null) {
    throw new AppError("Failed to create ledger entry", "ENTRY_CREATE_FAILED");
  }

  return mapLedgerEntryDto(entry);
}

export async function updateLedgerEntryWithConversion(input: {
  ledgerId: string;
  ledgerEntryId: string;
  categoryId?: string | null;
  amount?: number;
  currency?: string | null;
  itemName?: string;
  description?: string | null;
}): Promise<LedgerEntryDto> {
  const q = forLedger(ledgerEntries, input.ledgerId);
  const updateData = applyLedgerEntryPatch(input, new Date());

  if (input.amount !== undefined || input.currency !== undefined) {
    const [currentEntry, mainCurrency] = await Promise.all([
      db.query.ledgerEntries.findFirst({
        where: and(
          eq(ledgerEntries.id, input.ledgerEntryId),
          eq(ledgerEntries.ledgerId, input.ledgerId),
          isNull(ledgerEntries.deletedAt)
        ),
        with: { sourceDocument: true },
      }),
      getLedgerMainCurrency(input.ledgerId),
    ]);

    if (currentEntry != null) {
      const sourceEntryDate = currentEntry.sourceDocument?.entryDate ?? undefined;
      const conversion = await convertEntryAmount({
        amount: input.amount ?? Number(currentEntry.amount),
        fromCurrency: normalizeCurrency(input.currency ?? currentEntry.currency),
        toCurrency: mainCurrency,
        ...(sourceEntryDate !== undefined ? { date: sourceEntryDate } : {}),
      });

      if (conversion != null) {
        updateData.convertedAmount = conversion.convertedAmount;
        updateData.exchangeRate = conversion.exchangeRate;
      }
    }
  }

  const [updatedEntry] = await db
    .update(ledgerEntries)
    .set(updateData)
    .where(q.whereId(input.ledgerEntryId))
    .returning();

  if (updatedEntry == null) {
    throw new NotFoundError("Entry");
  }

  return mapLedgerEntryDto(updatedEntry);
}

export async function batchUpdateLedgerEntries(input: {
  ledgerId: string;
  ledgerEntryIds: string[];
  categoryId?: string | null;
  currency?: string | null;
  amount?: number;
  description?: string | null;
  itemName?: string;
}): Promise<number> {
  const updateData: Partial<typeof ledgerEntries.$inferSelect> = { updatedAt: new Date() };
  if (input.categoryId !== undefined) updateData.categoryId = input.categoryId;
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.amount !== undefined) updateData.amount = input.amount.toFixed(2);
  if (input.description !== undefined) updateData.description = input.description;
  if (input.itemName !== undefined) updateData.itemName = input.itemName;

  const q = forLedger(ledgerEntries, input.ledgerId);
  const updatedEntries = await db
    .update(ledgerEntries)
    .set(updateData)
    .where(and(q.whereActive, inArray(ledgerEntries.id, input.ledgerEntryIds)))
    .returning({ id: ledgerEntries.id });

  if (input.currency !== undefined && updatedEntries.length > 0) {
    const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
    recalculateEntriesConvertedAmount(input.ledgerId, mainCurrency).catch((err) => {
      logger.error(
        { err, ledgerId: input.ledgerId },
        "Failed to recalculate after batch currency update"
      );
    });
  }

  return updatedEntries.length;
}
