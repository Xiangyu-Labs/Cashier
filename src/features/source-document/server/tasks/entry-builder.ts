import { formatDateTimeForApi } from "@/lib/date-utils";
import { ExchangeRateService } from "@/modules/currency";
import { logger } from "@/lib/logger";
import type { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/types";

export interface EntryToInsert {
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string;
  amount: string;
  currency: string;
  itemName: string;
  description: string | null;
  entryDate: string;
  convertedAmount: string | null;
  exchangeRate: string | null;
}

export interface BuildEntriesParams {
  validEntries: ParsedLedgerEntry[];
  categories: CategoryInfo[];
  sourceDocumentId: string;
  ledgerId: string;
  mainCurrency: string;
  fallbackDate: string;
}

/**
 * Build entries for database insertion with currency conversion
 */
export async function buildEntriesForInsert({
  validEntries,
  categories,
  sourceDocumentId,
  ledgerId,
  mainCurrency,
  fallbackDate,
}: BuildEntriesParams): Promise<EntryToInsert[]> {
  return Promise.all(
    validEntries.map(async (entry) => {
      // categoryIndex is 1-based, so index 1 = categories[0]
      const categoryId =
        entry.categoryIndex > 0 && entry.categoryIndex <= categories.length
          ? (categories[entry.categoryIndex - 1]?.id ?? null)
          : null;

      const entryCurrency = entry.currency ?? "CNY";

      // Calculate converted amount
      let convertedAmount: string | null = null;
      let exchangeRate: string | null = null;

      if (entryCurrency === mainCurrency) {
        convertedAmount = entry.amount.toFixed(2);
        exchangeRate = "1";
      } else {
        try {
          const converted = await ExchangeRateService.convert(
            entry.amount,
            entryCurrency,
            mainCurrency,
            fallbackDate
          );
          convertedAmount = converted.toFixed(2);
          exchangeRate = (converted / entry.amount).toFixed(6);
        } catch (err) {
          logger.warn(
            { err, entryCurrency, mainCurrency },
            "Failed to convert amount in batch insert"
          );
        }
      }

      return {
        ledgerId,
        categoryId,
        sourceDocumentId,
        amount: entry.amount.toFixed(2),
        currency: entryCurrency,
        itemName: entry.itemName !== "" ? entry.itemName : "Uncategorized",
        description: entry.notes ?? null,
        entryDate: fallbackDate,
        convertedAmount,
        exchangeRate,
      };
    })
  );
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validate entries before saving
 */
export function validateEntries(entries: ParsedLedgerEntry[]): ValidationResult {
  const validEntries = entries.filter((entry) => entry.amount > 0);

  if (validEntries.length === 0) {
    return { isValid: false, reason: "No entries with valid amount" };
  }

  const unknownCurrencyEntries = validEntries.filter(
    (entry) => entry.currency == null || entry.currency === "" || entry.currency.toLowerCase() === "unknown"
  );

  if (unknownCurrencyEntries.length > 0) {
    return { isValid: false, reason: "Unable to recognize currency type" };
  }

  return { isValid: true };
}

export interface DateFallbackResult {
  todayDate: string;
  fallbackDate: string;
}

/**
 * Get fallback date for entries
 */
export function getEntryFallbackDate(docEntryDate: string | null): DateFallbackResult {
  const todayDate = formatDateTimeForApi(new Date())!;
  const fallbackDate = docEntryDate ?? todayDate;

  return { todayDate, fallbackDate };
}
