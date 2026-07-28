import { and, eq, inArray, isNull } from "drizzle-orm";
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
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import { ExchangeRateService } from "./exchange-rate";
import { ConflictError } from "@/lib/errors";

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
  if (input.ledgerEntryIds.length === 0) return 0;
  const requestedIds = [...new Set(input.ledgerEntryIds)].sort();
  const legacyDocuments = await db
    .select({
      id: sourceDocuments.id,
      activeRevisionId: sourceDocuments.activeRevisionId,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, input.ledgerId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        inArray(ledgerEntries.id, requestedIds),
        isNull(ledgerEntries.deletedAt)
      )
    );
  for (const documentId of [
    ...new Set(
      legacyDocuments
        .filter((document) => document.activeRevisionId == null)
        .map((document) => document.id)
    ),
  ].sort()) {
    await ensureTargetLedgerProjection(input.ledgerId, documentId);
  }

  return db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    const candidates = await tx
      .select({ sourceDocumentId: ledgerEntries.sourceDocumentId })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, requestedIds),
          isNull(ledgerEntries.deletedAt)
        )
      );
    const documentIds = [
      ...new Set(candidates.flatMap((row) => row.sourceDocumentId == null ? [] : [row.sourceDocumentId])),
    ].sort();
    for (const documentId of documentIds) {
      await lockSourceDocumentForUpdate(tx, input.ledgerId, documentId);
    }

    const rows = await tx
      .select({
        id: ledgerEntries.id,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        sourceDocumentId: ledgerEntries.sourceDocumentId,
        sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
        activeRevisionId: sourceDocuments.activeRevisionId,
        entryDate: sourceDocuments.entryDate,
      })
      .from(ledgerEntries)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
          eq(sourceDocuments.ledgerId, input.ledgerId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, requestedIds),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(ledgerEntries.id);

    if (
      rows.length !== requestedIds.length ||
      rows.some(
        (row) =>
          row.sourceDocumentId == null ||
          row.activeRevisionId == null ||
          row.sourceDocumentRevisionId !== row.activeRevisionId
      )
    ) {
      throw new ConflictError("Selected ledger entries changed before the batch edit");
    }

    const mainCurrency = lockedLedger.metadata?.settings?.mainCurrency ?? "CNY";
    const conversions =
      input.amount !== undefined || input.currency !== undefined
        ? await ExchangeRateService.convertBatch(
            rows.map((row) => ({
              amount: input.amount ?? row.amount,
              from: normalizeCurrency(input.currency ?? row.currency),
              to: mainCurrency,
              ...(row.entryDate != null && row.entryDate !== "" ? { date: row.entryDate } : {}),
            })),
            mainCurrency
          )
        : null;
    const now = new Date();
    for (const [index, row] of rows.entries()) {
      const conversion = conversions?.[index];
      const updated = await tx
        .update(ledgerEntries)
        .set({
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.currency !== undefined ? { currency: normalizeCurrency(input.currency) } : {}),
          ...(input.amount !== undefined ? { amount: round(input.amount, 2) } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.itemName !== undefined ? { itemName: input.itemName } : {}),
          ...(conversion != null
            ? {
                convertedAmount: round(conversion.convertedAmount, 2),
                exchangeRate: round(conversion.exchangeRate, 6),
              }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(ledgerEntries.ledgerId, input.ledgerId),
            eq(ledgerEntries.id, row.id),
            eq(ledgerEntries.sourceDocumentRevisionId, row.activeRevisionId!),
            isNull(ledgerEntries.deletedAt)
          )
        )
        .returning({ id: ledgerEntries.id });
      if (updated.length !== 1) {
        throw new ConflictError("Ledger entry changed during the batch edit");
      }
    }
    return rows.length;
  });
}
