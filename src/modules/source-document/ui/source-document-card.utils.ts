import type { LedgerEntry } from "@/modules/ledger/contracts";
import Decimal from "decimal.js";

import type { SourceDocumentCardTotals } from "./source-document-card.types";

export function sortSourceDocumentEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    const categoryOrder = (a.category?.sortOrder ?? 999999) - (b.category?.sortOrder ?? 999999);
    return categoryOrder !== 0 ? categoryOrder : new Decimal(b.amount).cmp(a.amount);
  });
}

function getEntryCurrency(entry: LedgerEntry, mainCurrency: string): string {
  return entry.currency != null && entry.currency !== "" ? entry.currency : mainCurrency;
}

export function buildSourceDocumentCardTotals(
  entries: LedgerEntry[],
  mainCurrency: string
): SourceDocumentCardTotals {
  const subtotalsByCurrency: Record<string, string> = {};
  let totalInMainCurrency = new Decimal(0);

  entries.forEach((entry) => {
    const currency = getEntryCurrency(entry, mainCurrency);
    const amount = new Decimal(entry.amount);
    subtotalsByCurrency[currency] = new Decimal(subtotalsByCurrency[currency] ?? 0)
      .plus(amount)
      .toFixed();

    if (entry.convertedAmount != null && entry.convertedAmount !== "") {
      totalInMainCurrency = totalInMainCurrency.plus(entry.convertedAmount);
      return;
    }

    if (currency === mainCurrency) {
      totalInMainCurrency = totalInMainCurrency.plus(amount);
    }
  });

  const breakdownData = Object.keys(subtotalsByCurrency).map((currency) => {
    const convertedAmount = entries
      .filter((entry) => getEntryCurrency(entry, mainCurrency) === currency)
      .reduce((sum, entry) => {
        if (entry.convertedAmount != null && entry.convertedAmount !== "") {
          return sum.plus(entry.convertedAmount);
        }

        if (currency === mainCurrency) {
          return sum.plus(entry.amount);
        }

        return sum;
      }, new Decimal(0));

    return {
      currency,
      amount: subtotalsByCurrency[currency] ?? "0",
      convertedAmount: convertedAmount.toFixed(),
    };
  });

  return {
    subtotalsByCurrency,
    totalInMainCurrency: totalInMainCurrency.toFixed(),
    breakdownData,
  };
}
