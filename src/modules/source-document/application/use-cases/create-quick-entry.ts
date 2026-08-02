import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { round } from "@/lib/money/decimal";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import { getEntryCategoryName } from "@/modules/ledger/source-document-queries";
import type { QuickEntryResponseDto } from "@/modules/source-document/contracts";
import type { FxRateBook } from "@/modules/currency/application/ports";
import type { QuickEntryPorts } from "../ports";

export interface CreateQuickEntryPayload {
  categoryId: string;
  amount: number;
  currency?: string;
  itemName?: string;
  description?: string | null;
  entryDate?: string;
}

interface ConversionResult {
  convertedAmount: string;
  exchangeRate: string;
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
  date: string,
  rates: FxRateBook
): Promise<ConversionResult> {
  const result = await convertEntryAmount(
    {
      amount: String(amount),
      fromCurrency,
      toCurrency,
      date,
    },
    rates
  );

  return result;
}

async function createQuickEntryAtomically(
  ledgerId: string,
  categoryName: string,
  currency: string,
  conversion: ConversionResult,
  data: QuickEntryInsertData,
  ports: QuickEntryPorts
): Promise<{ sourceDocumentId: string; ledgerEntryId: string }> {
  const ledgerEntryId = crypto.randomUUID();
  const itemName = data.itemName ?? categoryName;
  const created = await ports.projections.createManual({
    ledgerId,
    title: categoryName,
    entryDate: data.entryDate,
    entries: [
      {
        id: ledgerEntryId,
        categoryId: data.categoryId,
        amount: round(String(data.amount), 2),
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

export async function createQuickEntry<
  TLedger extends {
    settings: { mainCurrency?: string; timeZone?: string | null };
  },
>(
  ledgerId: string,
  ledger: TLedger,
  payload: CreateQuickEntryPayload,
  ports: QuickEntryPorts
): Promise<QuickEntryResponseDto> {
  const mainCurrency = ledger.settings.mainCurrency ?? "CNY";
  const entryCurrency = payload.currency ?? mainCurrency;
  const timeZone = ledger.settings.timeZone ?? undefined;
  const entryDate =
    payload.entryDate ?? getDateInTimezone(timeZone) ?? formatDateTimeForApi(new Date());

  const [categoryName, conversion] = await Promise.all([
    getEntryCategoryName(ledgerId, payload.categoryId, ports.categories),
    resolveConversion(payload.amount, entryCurrency, mainCurrency, entryDate, ports.rates),
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
    },
    ports
  );

  return {
    sourceDocumentId: result.sourceDocumentId,
    ledgerEntryId: result.ledgerEntryId,
    status: "completed",
  };
}
