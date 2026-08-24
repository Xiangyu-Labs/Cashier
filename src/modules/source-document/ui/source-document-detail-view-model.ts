import Decimal from "decimal.js";
import { roundToCurrency } from "@/lib/money/currency-precision";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryEditData } from "@/modules/source-document/types";

export interface SourceDocumentDetailPendingChanges {
  entries: Record<string, Partial<EntryEditData>>;
}

export interface SourceDocumentDetailDisplayEntry extends Omit<
  LedgerEntry,
  "amount" | "convertedAmount" | "exchangeRate" | "currency"
> {
  amount: string;
  convertedAmount: string | null;
  exchangeRate: string | null;
  currency: string;
}

interface BuildSourceDocumentDetailViewModelInput {
  ledgerEntries: LedgerEntry[];
  pendingChanges: SourceDocumentDetailPendingChanges;
  mainCurrency: string;
  entryDate: string;
  originalEntryDate: string;
}

export function buildSourceDocumentDetailViewModel({
  ledgerEntries,
  pendingChanges,
  mainCurrency,
  entryDate,
  originalEntryDate,
}: BuildSourceDocumentDetailViewModelInput) {
  const displayEntries = ledgerEntries.map((entry) => {
    const change = pendingChanges.entries[entry.id] ?? {};
    const currency = change.currency ?? entry.currency ?? mainCurrency;
    const amount = new Decimal(change.amount ?? entry.amount).toFixed();
    const conversionIdentityChanged =
      currency !== (entry.currency ?? mainCurrency) || entryDate !== originalEntryDate;
    const exchangeRate =
      !conversionIdentityChanged && entry.exchangeRate != null && entry.exchangeRate !== ""
        ? entry.exchangeRate
        : null;

    const convertedAmount =
      currency === mainCurrency
        ? amount
        : entry.convertedAmount != null &&
            entry.convertedAmount !== "" &&
            change.amount === undefined &&
            change.currency === undefined &&
            entryDate === originalEntryDate
          ? new Decimal(entry.convertedAmount).toFixed()
          : exchangeRate != null
            ? roundToCurrency(new Decimal(amount).times(exchangeRate).toFixed(), mainCurrency)
            : null;

    return {
      ...entry,
      amount,
      currency,
      convertedAmount,
      exchangeRate,
    };
  });

  const subtotalsByCurrency = displayEntries.reduce<Record<string, string>>((groups, entry) => {
    groups[entry.currency] = new Decimal(groups[entry.currency] ?? 0).plus(entry.amount).toFixed();
    return groups;
  }, {});

  const totalInMainCurrency = displayEntries
    .reduce((total, entry) => total.plus(entry.convertedAmount ?? 0), new Decimal(0))
    .toFixed();
  const unconvertedCount = displayEntries.filter((entry) => entry.convertedAmount == null).length;

  return {
    displayEntries,
    subtotalsByCurrency,
    totalInMainCurrency,
    unconvertedCount,
  };
}
