import type { LedgerEntry } from "@/modules/ledger/contracts";
import { parseAmount } from "@/lib/formatters";

import type { SourceDocumentCardTotals } from "./source-document-card.types";

export function sortSourceDocumentEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    const categoryOrder = (a.category?.sortOrder ?? 999999) - (b.category?.sortOrder ?? 999999);
    return categoryOrder !== 0 ? categoryOrder : parseAmount(b.amount) - parseAmount(a.amount);
  });
}

function getEntryCurrency(entry: LedgerEntry, mainCurrency: string): string {
  return entry.currency != null && entry.currency !== "" ? entry.currency : mainCurrency;
}

export function buildSourceDocumentCardTotals(
  entries: LedgerEntry[],
  mainCurrency: string
): SourceDocumentCardTotals {
  const subtotalsByCurrency: Record<string, number> = {};
  let totalInMainCurrency = 0;

  entries.forEach((entry) => {
    const currency = getEntryCurrency(entry, mainCurrency);
    const amount = parseAmount(entry.amount);
    subtotalsByCurrency[currency] = (subtotalsByCurrency[currency] ?? 0) + amount;

    if (entry.convertedAmount != null && entry.convertedAmount !== "") {
      totalInMainCurrency += parseAmount(entry.convertedAmount);
      return;
    }

    if (currency === mainCurrency) {
      totalInMainCurrency += amount;
    }
  });

  const breakdownData = Object.keys(subtotalsByCurrency).map((currency) => {
    const convertedAmount = entries
      .filter((entry) => getEntryCurrency(entry, mainCurrency) === currency)
      .reduce((sum, entry) => {
        if (entry.convertedAmount != null && entry.convertedAmount !== "") {
          return sum + parseAmount(entry.convertedAmount);
        }

        if (currency === mainCurrency) {
          return sum + parseAmount(entry.amount);
        }

        return sum;
      }, 0);

    return {
      currency,
      amount: subtotalsByCurrency[currency] ?? 0,
      convertedAmount,
    };
  });

  return {
    subtotalsByCurrency,
    totalInMainCurrency,
    breakdownData,
  };
}
