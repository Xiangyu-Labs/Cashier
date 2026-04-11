import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsedLedgerEntry } from "@/lib/ai/types";
import type { ParseSourceDocumentOutput } from "../tasks/parse-source-document";
import type { ParsePipelineResult } from "./pipeline";
import type { NormalizedLedgerEntry, NormalizedOrderAdjustment } from "./parser-schema";

/**
 * Distribute order adjustments proportionally into ledger entries by receipt_index.
 *
 * A receipt has exactly one currency, so currency is irrelevant for matching.
 * Adjustments with no matching entries (orphaned receipt_index) are dropped.
 * No adjustment rows are ever returned as separate entries.
 */
function distributeAdjustments(
  ledgerEntries: NormalizedLedgerEntry[],
  orderAdjustments: NormalizedOrderAdjustment[]
): NormalizedLedgerEntry[] {
  if (orderAdjustments.length === 0) {
    return ledgerEntries;
  }

  // Group adjustments by receipt_index → net amount
  const adjByReceipt = new Map<number, number>();
  for (const adj of orderAdjustments) {
    adjByReceipt.set(adj.receipt_index, (adjByReceipt.get(adj.receipt_index) ?? 0) + adj.amount);
  }

  // Clone entries so originals are not mutated
  const result = ledgerEntries.map((e) => ({ ...e }));

  for (const [receiptIndex, netAmount] of adjByReceipt) {
    const matchingIndices = result
      .map((e, i) => (e.receipt_index === receiptIndex ? i : -1))
      .filter((i) => i !== -1);

    if (matchingIndices.length === 0) continue;

    const totalAmount = matchingIndices.reduce((sum, i) => sum + (result[i]?.amount ?? 0), 0);
    let distributed = 0;

    for (let k = 0; k < matchingIndices.length - 1; k++) {
      const i = matchingIndices[k]!;
      const entry = result[i]!;
      const share = parseFloat(((netAmount * entry.amount) / totalAmount).toFixed(2));
      entry.amount = parseFloat((entry.amount + share).toFixed(2));
      distributed += share;
    }

    // Last entry absorbs rounding remainder to preserve exact total
    const lastIdx = matchingIndices[matchingIndices.length - 1]!;
    const remainder = parseFloat((netAmount - distributed).toFixed(2));
    result[lastIdx]!.amount = parseFloat((result[lastIdx]!.amount + remainder).toFixed(2));
  }

  return result;
}

export function convertToParsedEntries({
  ledgerEntries,
  orderAdjustments,
}: {
  ledgerEntries: NormalizedLedgerEntry[];
  orderAdjustments: NormalizedOrderAdjustment[];
}): ParsedLedgerEntry[] {
  const entries = distributeAdjustments(ledgerEntries, orderAdjustments);

  return entries.map((entry) => ({
    itemName: entry.item_name,
    amount: entry.amount,
    currency: entry.currency,
    categoryIndex: entry.category_index,
    entryDate: null,
    notes: entry.notes,
    receiptIndex: entry.receipt_index,
    isAdjustment: false,
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
        verificationStatus: "invalid",
      };
    case "anomaly":
      return {
        ledgerEntries: [],
        title: result.title,
        anomalyReason: result.anomalyReason,
        verificationStatus: "anomaly",
      };
    case "cancelled":
      throw new TaskCancelledError();
  }
}
