import { formatDateTimeForApi } from "@/lib/date-utils";
import { db } from "@/lib/db";
import { initializeExchangeRateLedgerRecalculationOrchestration } from "@/lib/orchestration/exchange-rate-ledger-recalculation";
import { convertEntryAmount } from "@/modules/currency/use-cases";
import { getEntryCategoryName } from "@/modules/ledger/queries";
import { insertSourceDocumentLedgerEntry } from "@/modules/source-document/application/services/source-document-ledger-entries";
import type { QuickEntryResponseDto } from "@/modules/source-document/contracts";
import { SourceDocumentType } from "@/modules/source-document/types";
import { sourceDocuments, type Ledger } from "@/persistence";

initializeExchangeRateLedgerRecalculationOrchestration();

export interface CreateQuickEntryPayload {
  categoryId: string;
  amount: number;
  currency?: string;
  itemName?: string;
  description?: string | null;
  entryDate?: string;
}

interface ConversionResult {
  convertedAmount: string | null;
  exchangeRate: string | null;
}

interface QuickEntryInsertData {
  categoryId: string;
  itemName: string | null;
  description: string | null;
  amount: number;
  entryDate: string;
}

async function resolveConversion(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<ConversionResult> {
  const result = await convertEntryAmount({
    amount,
    fromCurrency,
    toCurrency,
    date,
  });

  return result ?? { convertedAmount: null, exchangeRate: null };
}

function createQuickEntryAtomically(
  ledgerId: string,
  categoryName: string,
  currency: string,
  conversion: ConversionResult,
  data: QuickEntryInsertData
): { sourceDocumentId: string; ledgerEntryId: string } {
  const sourceDocumentId = crypto.randomUUID();
  const ledgerEntryId = crypto.randomUUID();
  const itemName = data.itemName ?? categoryName;

  db.transaction((tx) => {
    tx.insert(sourceDocuments)
      .values({
        id: sourceDocumentId,
        ledgerId,
        title: categoryName,
        text: null,
        imageUrls: [],
        status: "completed",
        type: SourceDocumentType.Manual,
        entryDate: data.entryDate,
      })
      .run();

    insertSourceDocumentLedgerEntry(tx, {
      id: ledgerEntryId,
      ledgerId,
      sourceDocumentId,
      categoryId: data.categoryId,
      amount: data.amount.toFixed(2),
      currency,
      itemName,
      description: data.description,
      convertedAmount: conversion.convertedAmount,
      exchangeRate: conversion.exchangeRate,
    });
  });

  return { sourceDocumentId, ledgerEntryId };
}

export async function createQuickEntry(
  ledgerId: string,
  ledger: Ledger,
  payload: CreateQuickEntryPayload
): Promise<QuickEntryResponseDto> {
  const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
  const entryCurrency = payload.currency ?? mainCurrency;
  const entryDate = payload.entryDate ?? formatDateTimeForApi(new Date());

  const [categoryName, conversion] = await Promise.all([
    getEntryCategoryName(payload.categoryId),
    resolveConversion(payload.amount, entryCurrency, mainCurrency, entryDate),
  ]);

  const result = createQuickEntryAtomically(ledgerId, categoryName, entryCurrency, conversion, {
    categoryId: payload.categoryId,
    itemName: payload.itemName ?? null,
    description: payload.description ?? null,
    amount: payload.amount,
    entryDate,
  });

  return {
    sourceDocumentId: result.sourceDocumentId,
    ledgerEntryId: result.ledgerEntryId,
    status: "completed",
  };
}
