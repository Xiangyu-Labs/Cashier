import type {
  NormalizedLedgerEntry,
  NormalizedParseOutput,
  NormalizedReceiptTotal,
} from "./parser-schema";

const GENERIC_ITEM_LABELS = {
  zh: "其他商品",
  default: "Other items",
} as const;

const GENERIC_ADJUSTMENT_LABELS = {
  zh: "未归因账单调整",
  default: "Unattributed bill adjustment",
} as const;

const RECONCILIATION_NOTES = {
  zh: "根据账单总额自动补齐的差额项目。",
  default: "Created during receipt-total reconciliation.",
} as const;

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isZhLanguage(aiLanguage?: string): boolean {
  return aiLanguage?.toLowerCase().startsWith("zh") ?? false;
}

function genericItemName(aiLanguage?: string): string {
  return isZhLanguage(aiLanguage) ? GENERIC_ITEM_LABELS.zh : GENERIC_ITEM_LABELS.default;
}

function genericAdjustmentName(aiLanguage?: string): string {
  return isZhLanguage(aiLanguage)
    ? GENERIC_ADJUSTMENT_LABELS.zh
    : GENERIC_ADJUSTMENT_LABELS.default;
}

function reconciliationNotes(aiLanguage?: string): string {
  return isZhLanguage(aiLanguage) ? RECONCILIATION_NOTES.zh : RECONCILIATION_NOTES.default;
}

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
      candidate.currency !== first.currency || Math.abs(candidate.amount - first.amount) > 0.01
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
  const buckets = new Map<number, { amount: number; count: number }>();
  for (const entry of entries) {
    if (entry.category_index <= 0) continue;
    const bucket = buckets.get(entry.category_index) ?? { amount: 0, count: 0 };
    bucket.amount += entry.amount;
    bucket.count += 1;
    buckets.set(entry.category_index, bucket);
  }

  const ranked = [...buckets.entries()].sort((a, b) => {
    const amountDiff = b[1].amount - a[1].amount;
    if (Math.abs(amountDiff) > 0.01) return amountDiff;
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
}):
  | { kind: "success"; result: NormalizedParseOutput }
  | { kind: "anomaly"; reason: string } {
  if (result.outcome !== "success") {
    return { kind: "anomaly", reason: "reconciliation requires success result" };
  }

  const receiptIndices = new Set<number>();
  for (const total of result.receipt_totals) receiptIndices.add(total.receipt_index);
  for (const entry of result.ledger_entries) receiptIndices.add(entry.receipt_index);
  for (const adjustment of result.order_adjustments) receiptIndices.add(adjustment.receipt_index);

  const reconciledEntries = [...result.ledger_entries.map((entry) => ({ ...entry }))];
  const reconciledAdjustments = [...result.order_adjustments.map((adjustment) => ({ ...adjustment }))];

  for (const receiptIndex of receiptIndices) {
    const target = determineTargetTotal(receiptIndex, result.receipt_totals);
    if (target.kind === "anomaly") {
      return target;
    }

    const entriesForReceipt = reconciledEntries.filter((entry) => entry.receipt_index === receiptIndex);
    const adjustmentsForReceipt = reconciledAdjustments.filter(
      (adjustment) => adjustment.receipt_index === receiptIndex
    );

    const entriesTotal = entriesForReceipt.reduce((sum, entry) => sum + entry.amount, 0);
    const adjustmentsTotal = adjustmentsForReceipt.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    const currentTotal = roundToCents(entriesTotal + adjustmentsTotal);
    const delta = roundToCents(target.total.amount - currentTotal);

    if (Math.abs(delta) <= 0.01) {
      continue;
    }

    if (delta > 0) {
      reconciledEntries.push({
        receipt_index: receiptIndex,
        item_name: genericItemName(aiLanguage),
        amount: delta,
        currency: target.total.currency,
        category_index: dominantCategoryIndex(entriesForReceipt),
        notes: reconciliationNotes(aiLanguage),
      });
      continue;
    }

    const syntheticAdjustmentAmount = delta;
    reconciledAdjustments.push({
      receipt_index: receiptIndex,
      item_name: genericAdjustmentName(aiLanguage),
      amount: syntheticAdjustmentAmount,
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
