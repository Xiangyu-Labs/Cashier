import Decimal from "decimal.js";
import { add, subtract, compare, round } from "@/lib/money/decimal";
import { getAiOutputCopy } from "@/config/ai-output-locales";
import { getCurrencyDecimals } from "@/lib/money/currency-precision";
import type { NormalizedParseOutput, NormalizedReceiptTotal } from "./parser-schema";

const MAX_ABSOLUTE_DIFFERENCE = new Decimal("1");
const MAX_RELATIVE_DIFFERENCE = new Decimal("0.02");

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

  const minorUnit = new Decimal(1).dividedBy(
    new Decimal(10).pow(getCurrencyDecimals(first.currency))
  );
  const hasConflict = matching.some(
    (candidate) =>
      candidate.currency !== first.currency ||
      new Decimal(candidate.amount).minus(first.amount).abs().gt(minorUnit)
  );
  if (hasConflict) {
    return {
      kind: "anomaly",
      reason: `Unable to reconcile receipt ${receiptIndex}: conflicting receipt totals`,
    };
  }

  return { kind: "ok", total: first };
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
    const containsForeignCurrency = [...entriesForReceipt, ...adjustmentsForReceipt].some(
      (item) => item.currency !== target.total.currency
    );
    if (containsForeignCurrency) {
      return {
        kind: "anomaly",
        reason: `Unable to reconcile receipt ${receiptIndex}: mixed currencies`,
      };
    }

    const entriesTotal = entriesForReceipt.reduce((sum, entry) => add(sum, entry.amount), "0");
    const adjustmentsTotal = adjustmentsForReceipt.reduce(
      (sum, adjustment) => add(sum, adjustment.amount),
      "0"
    );
    const decimals = getCurrencyDecimals(target.total.currency);
    const minorUnit = new Decimal(1).dividedBy(new Decimal(10).pow(decimals));
    const currentTotal = round(add(entriesTotal, adjustmentsTotal), decimals);
    const delta = round(subtract(target.total.amount, currentTotal), decimals);

    if (new Decimal(delta).abs().lt(minorUnit)) {
      continue;
    }

    const absoluteDelta = new Decimal(delta).abs();
    const absoluteTarget = new Decimal(target.total.amount).abs();
    const withinRelativeLimit =
      !absoluteTarget.isZero() &&
      absoluteDelta.dividedBy(absoluteTarget).lte(MAX_RELATIVE_DIFFERENCE);
    if (absoluteDelta.gt(MAX_ABSOLUTE_DIFFERENCE) || !withinRelativeLimit) {
      return {
        kind: "anomaly",
        reason: `amount_conflict: receipt ${receiptIndex} differs from extracted items by ${delta}`,
      };
    }

    if (compare(delta, "0") > 0) {
      reconciledEntries.push({
        receipt_index: receiptIndex,
        item_name: copy.otherItems,
        amount: delta,
        currency: target.total.currency,
        category_index: 0,
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
