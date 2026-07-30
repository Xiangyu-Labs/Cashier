import Decimal from "decimal.js";
import { add, subtract, compare, round } from "@/lib/money/decimal";
import { getAiOutputCopy } from "@/config/ai-output-locales";
import type {
  NormalizedLedgerEntry,
  NormalizedParseOutput,
  NormalizedReceiptTotal,
} from "./parser-schema";

function determineTargetTotal(
  receiptIndex: number,
  receiptTotals: NormalizedReceiptTotal[]
): { kind: "ok"; total: NormalizedReceiptTotal } | { kind: "anomaly"; reason: string } {
  const matching = receiptTotals.filter((total) => total.receipt_index === receiptIndex);
  if (matching.length === 0) {
    return {
      kind: "anomaly",
      reason: `Unable to reconcile receipt ${receiptIndex}: missing receipt total`,
    };
  }

  const [first] = matching;
  if (first == null) {
    return {
      kind: "anomaly",
      reason: `Unable to reconcile receipt ${receiptIndex}: missing receipt total`,
    };
  }

  const hasConflict = matching.some(
    (candidate) =>
      candidate.currency !== first.currency ||
      compare(new Decimal(candidate.amount).minus(first.amount).abs().toFixed(), "0.01") > 0
  );
  if (hasConflict) {
    return {
      kind: "anomaly",
      reason: `Unable to reconcile receipt ${receiptIndex}: conflicting receipt totals`,
    };
  }

  return { kind: "ok", total: first };
}

function dominantCategoryIndex(entries: NormalizedLedgerEntry[]): number {
  const buckets = new Map<number, { amount: string; count: number }>();
  for (const entry of entries) {
    if (entry.category_index <= 0) continue;
    const bucket = buckets.get(entry.category_index) ?? { amount: "0", count: 0 };
    bucket.amount = add(bucket.amount, entry.amount);
    bucket.count += 1;
    buckets.set(entry.category_index, bucket);
  }

  const ranked = [...buckets.entries()].sort((a, b) => {
    const amountCmp = compare(b[1].amount, a[1].amount);
    if (amountCmp !== 0) return amountCmp;
    const countDiff = b[1].count - a[1].count;
    if (countDiff !== 0) return countDiff;
    return a[0] - b[0];
  });

  return ranked[0]?.[0] ?? 0;
}

export function reconcileParseOutput({
  aiLanguage,
  result,
}: {
  aiLanguage?: string;
  result: NormalizedParseOutput;
}): { kind: "success"; result: NormalizedParseOutput } | { kind: "anomaly"; reason: string } {
  if (result.outcome !== "success") {
    return { kind: "anomaly", reason: "reconciliation requires success result" };
  }

  const copy = getAiOutputCopy(aiLanguage);

  const receiptIndices = new Set<number>();
  for (const total of result.receipt_totals) receiptIndices.add(total.receipt_index);
  for (const entry of result.ledger_entries) receiptIndices.add(entry.receipt_index);
  for (const adjustment of result.order_adjustments) receiptIndices.add(adjustment.receipt_index);

  const reconciledEntries = [...result.ledger_entries.map((entry) => ({ ...entry }))];
  const reconciledAdjustments = [
    ...result.order_adjustments.map((adjustment) => ({ ...adjustment })),
  ];

  for (const receiptIndex of receiptIndices) {
    const target = determineTargetTotal(receiptIndex, result.receipt_totals);
    if (target.kind === "anomaly") {
      return target;
    }

    const entriesForReceipt = reconciledEntries.filter(
      (entry) => entry.receipt_index === receiptIndex
    );
    const adjustmentsForReceipt = reconciledAdjustments.filter(
      (adjustment) => adjustment.receipt_index === receiptIndex
    );

    const entriesTotal = entriesForReceipt.reduce((sum, entry) => add(sum, entry.amount), "0");
    const adjustmentsTotal = adjustmentsForReceipt.reduce(
      (sum, adjustment) => add(sum, adjustment.amount),
      "0"
    );
    const currentTotal = round(add(entriesTotal, adjustmentsTotal), 2);
    const delta = round(subtract(target.total.amount, currentTotal), 2);

    if (compare(new Decimal(delta).abs().toFixed(), "0.01") <= 0) {
      continue;
    }

    if (compare(delta, "0") > 0) {
      reconciledEntries.push({
        receipt_index: receiptIndex,
        item_name: copy.otherItems,
        amount: delta,
        currency: target.total.currency,
        category_index: dominantCategoryIndex(entriesForReceipt),
        notes: copy.reconciliationNote,
      });
      continue;
    }

    // delta is negative — synthesize an adjustment
    reconciledAdjustments.push({
      receipt_index: receiptIndex,
      item_name: copy.unattributedAdjustment,
      amount: delta,
      currency: target.total.currency,
    });
  }

  return {
    kind: "success",
    result: {
      ...result,
      ledger_entries: reconciledEntries,
      order_adjustments: reconciledAdjustments,
    },
  };
}
