import { z } from "zod";

// ===== Raw Zod schema (AI response shape) =====

const receiptTotalSchema = z.object({
  receipt_index: z.number().int().min(0),
  amount: z.number(),
  currency: z.string(),
});

const ledgerEntrySchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

const orderAdjustmentSchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
});

export const parserOutputSchema = z.object({
  outcome: z.enum(["success", "invalid", "anomaly"]).default("success"),
  anomaly_reason: z.string().nullish(),
  title: z.string().nullish(),
  receipt_count: z.number().int().min(0).default(1),
  receipt_totals: z.array(receiptTotalSchema).default([]),
  ledger_entries: z.array(ledgerEntrySchema).default([]),
  order_adjustments: z.array(orderAdjustmentSchema).default([]),
  reasoning: z.string(),
});

// ===== Normalized output type =====

export interface NormalizedReceiptTotal {
  receipt_index: number;
  amount: number;
  currency: string;
}

export interface NormalizedLedgerEntry {
  receipt_index: number;
  item_name: string;
  amount: number;
  currency: string;
  category_index: number;
  notes: string | null;
}

export interface NormalizedOrderAdjustment {
  receipt_index: number;
  item_name: string;
  amount: number;
  currency: string;
}

export interface NormalizedParseOutput {
  outcome: "success" | "invalid" | "anomaly";
  anomaly_reason?: string;
  title: string;
  receipt_count: number;
  receipt_totals: NormalizedReceiptTotal[];
  ledger_entries: NormalizedLedgerEntry[];
  order_adjustments: NormalizedOrderAdjustment[];
  reasoning: string;
}

function fallbackTitleForOutcome(output: z.infer<typeof parserOutputSchema>): string {
  switch (output.outcome) {
    case "invalid":
      return "Invalid content";
    case "anomaly":
      return "Unparseable document";
    default:
      return "Untitled document";
  }
}

function normalizeTitle(output: z.infer<typeof parserOutputSchema>): string {
  const title = output.title?.trim();
  return title != null && title !== "" ? title : fallbackTitleForOutcome(output);
}

// ===== Normalization =====

export function normalizeResult(
  output: z.infer<typeof parserOutputSchema>
): NormalizedParseOutput {
  // Validate: ledger_entry amounts must be positive (> 0)
  const invalidEntry = output.ledger_entries.find((e) => e.amount <= 0);
  if (invalidEntry != null) {
    return {
      outcome: "anomaly",
      anomaly_reason: `ledger_entry "${invalidEntry.item_name}" has non-positive amount ${invalidEntry.amount} — likely an order-level adjustment misclassified as a line item`,
      title: normalizeTitle(output),
      receipt_count: output.receipt_count,
      receipt_totals: output.receipt_totals,
      ledger_entries: [],
      order_adjustments: output.order_adjustments,
      reasoning: output.reasoning,
    };
  }

  return {
    outcome: output.outcome,
    ...(output.anomaly_reason != null ? { anomaly_reason: output.anomaly_reason } : {}),
    title: normalizeTitle(output),
    receipt_count: output.receipt_count,
    receipt_totals: output.receipt_totals,
    ledger_entries: output.ledger_entries.map((e) => ({
      receipt_index: e.receipt_index,
      item_name: e.item_name,
      amount: e.amount,
      currency: e.currency,
      category_index: e.category_index,
      notes: e.notes ?? null,
    })),
    order_adjustments: output.order_adjustments,
    reasoning: output.reasoning,
  };
}

// ===== Complexity policy =====

/**
 * Returns true when the document is complex enough to warrant a second parse pass.
 * Only applies to successful outcomes; invalid/anomaly short-circuit without dual-run.
 */
export function shouldDualRun(result: NormalizedParseOutput): boolean {
  if (result.outcome !== "success") return false;

  // More than 3 entries is complex
  if (result.ledger_entries.length > 3) return true;

  // Multiple currencies is complex
  const currencies = new Set(result.ledger_entries.map((e) => e.currency));
  if (currencies.size > 1) return true;

  return false;
}

// ===== Result comparison =====

function groupTotals(entries: { currency: string; category_index: number; amount: number }[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, e) => {
    const key = `${e.currency}:${e.category_index}`;
    acc[key] = (acc[key] ?? 0) + e.amount;
    return acc;
  }, {});
}

function groupAdjustments(adjustments: { currency: string; amount: number }[]): Record<string, number> {
  return adjustments.reduce<Record<string, number>>((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.amount;
    return acc;
  }, {});
}


function groupReceiptTotals(
  totals: { receipt_index: number; currency: string; amount: number }[]
): Record<string, number> {
  return totals.reduce<Record<string, number>>((acc, total) => {
    const key = `${total.receipt_index}:${total.currency}`;
    acc[key] = (acc[key] ?? 0) + total.amount;
    return acc;
  }, {});
}

function mapsMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.join("|") !== bKeys.join("|")) return false;
  return aKeys.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) <= 0.01);
}

/**
 * Returns true when two normalized results are close enough to be treated as consistent.
 * Compares receipt totals, entry grouped sums, and adjustment grouped sums.
 */
export function compareResults(
  left: NormalizedParseOutput,
  right: NormalizedParseOutput
): boolean {
  if (left.outcome !== right.outcome) return false;
  if (left.ledger_entries.length !== right.ledger_entries.length) return false;
  if (left.order_adjustments.length !== right.order_adjustments.length) return false;

  // Compare receipt totals
  if (!mapsMatch(groupReceiptTotals(left.receipt_totals), groupReceiptTotals(right.receipt_totals))) {
    return false;
  }

  // Compare entry grouped sums
  if (!mapsMatch(groupTotals(left.ledger_entries), groupTotals(right.ledger_entries))) return false;

  // Compare adjustment grouped sums
  if (!mapsMatch(groupAdjustments(left.order_adjustments), groupAdjustments(right.order_adjustments))) return false;

  return true;
}
