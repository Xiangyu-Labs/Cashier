import { formatDateTimeForApi } from "@/lib/date-utils";
import { sqliteLedgerProjectionAdapter } from "@/application/adapters/sqlite";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import { getEntryCategoryName } from "@/modules/ledger/source-document-queries";
import type { QuickEntryResponseDto } from "@/modules/source-document/contracts";
import type { Ledger } from "@/persistence";

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

async function createQuickEntryAtomically(
  ledgerId: string,
  categoryName: string,
  currency: string,
  conversion: ConversionResult,
  data: QuickEntryInsertData
): Promise<{ sourceDocumentId: string; ledgerEntryId: string }> {
  const ledgerEntryId = crypto.randomUUID();
  const itemName = data.itemName ?? categoryName;
  const created = await sqliteLedgerProjectionAdapter.createManual({
    ledgerId,
    title: categoryName,
    entryDate: data.entryDate,
    entries: [
      {
        id: ledgerEntryId,
        categoryId: data.categoryId,
        amount: data.amount.toFixed(2),
        currency,
        itemName,
        description: data.description,
        convertedAmount: conversion.convertedAmount,
        exchangeRate: conversion.exchangeRate,
      },
    ],
  });
  return { sourceDocumentId: created.sourceDocumentId, ledgerEntryId };
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

  const result = await createQuickEntryAtomically(
    ledgerId,
    categoryName,
    entryCurrency,
    conversion,
    {
      categoryId: payload.categoryId,
      itemName: payload.itemName ?? null,
      description: payload.description ?? null,
      amount: payload.amount,
      entryDate,
    }
  );

  return {
    sourceDocumentId: result.sourceDocumentId,
    ledgerEntryId: result.ledgerEntryId,
    status: "completed",
  };
}
