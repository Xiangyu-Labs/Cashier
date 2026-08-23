import Decimal from "decimal.js";
import type { ParsedLedgerEntry } from "@/lib/ai/types";
import {
  ProcessingCancelledError,
  type ParsePipelineResult,
  type ParseSourceDocumentOutput,
} from "./contracts";
import type { NormalizedLedgerEntry, NormalizedOrderAdjustment } from "./parser-schema";
import { getCurrencyDecimals, roundToCurrency } from "@/lib/money/currency-precision";

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

  // Group adjustments by receipt_index → net amount (as Decimal)
  const adjByReceipt = new Map<number, Decimal>();
  for (const adj of orderAdjustments) {
    const current = adjByReceipt.get(adj.receipt_index) ?? new Decimal(0);
    adjByReceipt.set(adj.receipt_index, current.plus(adj.amount));
  }

  // Clone entries so originals are not mutated
  const result = ledgerEntries.map((e) => ({ ...e }));

  for (const [receiptIndex, netAmount] of adjByReceipt) {
    const matchingIndices = result
      .map((e, i) => (e.receipt_index === receiptIndex ? i : -1))
      .filter((i) => i !== -1);

    if (matchingIndices.length === 0) continue;

    const totalAmount = matchingIndices.reduce(
      (sum, i) => sum.plus(result[i]?.amount ?? 0),
      new Decimal(0)
    );
    let distributed = new Decimal(0);

    for (let k = 0; k < matchingIndices.length - 1; k++) {
      const i = matchingIndices[k]!;
      const entry = result[i]!;
      const share = netAmount.times(entry.amount).dividedBy(totalAmount);
      const decimals = getCurrencyDecimals(entry.currency);
      const roundedShare = share.toFixed(decimals, Decimal.ROUND_HALF_UP);
      entry.amount = new Decimal(entry.amount)
        .plus(roundedShare)
        .toFixed(decimals, Decimal.ROUND_HALF_UP);
      distributed = distributed.plus(roundedShare);
    }

    // Last entry absorbs rounding remainder to preserve exact total
    const lastIdx = matchingIndices[matchingIndices.length - 1]!;
    const lastEntry = result[lastIdx]!;
    const decimals = getCurrencyDecimals(lastEntry.currency);
    const remainder = netAmount.minus(distributed).toFixed(decimals, Decimal.ROUND_HALF_UP);
    lastEntry.amount = new Decimal(lastEntry.amount)
      .plus(remainder)
      .toFixed(decimals, Decimal.ROUND_HALF_UP);
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
    amount: roundToCurrency(entry.amount, entry.currency),
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
      throw new ProcessingCancelledError();
  }
}
