import { parseAmount } from "@/lib/formatters";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryEditData } from "@/modules/source-document/types";

export interface SourceDocumentDetailPendingChanges {
  entries: Record<string, Partial<EntryEditData>>;
}

export interface SourceDocumentDetailDisplayEntry
  extends Omit<LedgerEntry, "amount" | "convertedAmount" | "exchangeRate" | "currency"> {
  amount: number;
  convertedAmount: number | null;
  exchangeRate: number | null;
  currency: string;
}

interface BuildSourceDocumentDetailViewModelInput {
  ledgerEntries: LedgerEntry[];
  pendingChanges: SourceDocumentDetailPendingChanges;
  mainCurrency: string;
}

export function buildSourceDocumentDetailViewModel({
  ledgerEntries,
  pendingChanges,
  mainCurrency,
}: BuildSourceDocumentDetailViewModelInput) {
  const displayEntries = ledgerEntries.map((entry) => {
    const change = pendingChanges.entries[entry.id] ?? {};
    const currency = change.currency ?? entry.currency ?? mainCurrency;
    const amount = parseAmount(change.amount ?? entry.amount);
    const exchangeRate =
      entry.exchangeRate != null && entry.exchangeRate !== ""
        ? Number.parseFloat(entry.exchangeRate)
        : null;

    const convertedAmount =
      currency === mainCurrency
        ? amount
        : exchangeRate != null
          ? Number((amount * exchangeRate).toFixed(2))
          : entry.convertedAmount != null &&
              entry.convertedAmount !== "" &&
              change.amount === undefined &&
              change.currency === undefined
            ? parseAmount(entry.convertedAmount)
            : null;

    return {
      ...entry,
      amount,
      currency,
      convertedAmount,
      exchangeRate,
    };
  });

  const subtotalsByCurrency = displayEntries.reduce<Record<string, number>>((groups, entry) => {
    groups[entry.currency] = (groups[entry.currency] ?? 0) + entry.amount;
    return groups;
  }, {});

  const totalInMainCurrency = displayEntries.reduce((total, entry) => {
    return total + (entry.convertedAmount ?? 0);
  }, 0);

  return {
    displayEntries,
    subtotalsByCurrency,
    totalInMainCurrency,
  };
}
