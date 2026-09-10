import { compare } from "@/lib/money/decimal";
import type { ParsedLedgerEntry } from "@/lib/ai/types";
import {
  ProcessingCancelledError,
  type ParsePipelineResult,
  type ParseSourceDocumentOutput,
} from "./contracts";
import type { NormalizedLedgerEntry, NormalizedOrderAdjustment } from "./parser-schema";
import { roundToCurrency } from "@/lib/money/currency-precision";

export function convertToParsedEntries({
  ledgerEntries,
  orderAdjustments,
}: {
  ledgerEntries: NormalizedLedgerEntry[];
  orderAdjustments: NormalizedOrderAdjustment[];
}): ParsedLedgerEntry[] {
  const adjustments = orderAdjustments
    .filter((entry) => compare(entry.amount, "0") !== 0)
    .map((entry) => {
      const items = ledgerEntries.filter((item) => item.receipt_index === entry.receipt_index);
      const categories = new Set(items.map((item) => item.category_index));
      const sharedCategory = categories.size === 1 ? items[0]?.category_index : 0;
      const categoryIndex = entry.category_index > 0 ? entry.category_index : (sharedCategory ?? 0);
      return { ...entry, category_index: categoryIndex, notes: null };
    });
  const entries = [...ledgerEntries, ...adjustments];

  return entries.map((entry, index) => ({
    itemName: entry.item_name,
    amount: roundToCurrency(entry.amount, entry.currency),
    currency: entry.currency,
    categoryIndex: entry.category_index,
    entryDate: null,
    notes: entry.notes,
    receiptIndex: entry.receipt_index,
    isAdjustment: index >= ledgerEntries.length,
  }));
}

export function toParseSourceDocumentOutput(
  result: ParsePipelineResult
): ParseSourceDocumentOutput {
  switch (result.kind) {
    case "success":
      return {
        ledgerEntries: result.ledgerEntries,
        title: result.title,
        verificationStatus: "passed",
      };
    case "invalid":
      return {
        ledgerEntries: [],
        title: result.title,
        failureMessage: result.failureMessage,
        verificationStatus: "invalid",
      };
    case "cancelled":
      throw new ProcessingCancelledError();
  }
}
