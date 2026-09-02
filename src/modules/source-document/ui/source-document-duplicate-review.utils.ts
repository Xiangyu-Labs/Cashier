import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { add } from "@/lib/money/decimal";

export interface ReviewSide {
  id: string;
  title: string | null;
  entryDate: string | null;
  createdAt: string;
  entries: SourceDocumentDuplicateReviewDetailDto["duplicate"]["entries"];
  files: SourceDocumentDuplicateReviewDetailDto["duplicate"]["files"];
}

export function summarizeReviewEntries(
  entries: ReviewSide["entries"],
  mainCurrency: string
): { total: string; unconvertedCount: number; currencyTotals: Record<string, string> } {
  let total = "0";
  let unconvertedCount = 0;
  const currencyTotals: Record<string, string> = {};
  for (const entry of entries) {
    const currency = (entry.currency ?? mainCurrency).trim().toUpperCase();
    if (entry.convertedAmount != null && entry.convertedAmount !== "") {
      total = add(total, entry.convertedAmount);
    } else if (currency === mainCurrency.trim().toUpperCase()) {
      total = add(total, entry.amount);
    } else {
      unconvertedCount += 1;
      currencyTotals[currency] = add(currencyTotals[currency] ?? "0", entry.amount);
    }
  }
  return { total, unconvertedCount, currencyTotals };
}
