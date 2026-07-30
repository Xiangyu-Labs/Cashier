import { z } from "zod";
import Decimal from "decimal.js";
import { isValidDecimal, compare } from "@/lib/money/decimal";
import { getAiOutputCopy } from "@/config/ai-output-locales";

// ===== Decimal string validation =====

/**
 * Zod type for canonical decimal strings.
 * Rejects raw JSON numbers — the AI must output quoted strings.
 */
const decimalStringSchema = z.string().refine((v) => isValidDecimal(v), {
  message: 'Must be a valid decimal number string (e.g. "45.00")',
});

// ===== Raw Zod schema (AI response shape) =====

const receiptTotalSchema = z.object({
  receipt_index: z.number().int().min(0),
  amount: decimalStringSchema,
  currency: z.string(),
});

const ledgerEntrySchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: decimalStringSchema,
  currency: z.string(),
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

const orderAdjustmentSchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: decimalStringSchema,
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
  amount: string;
  currency: string;
}

export interface NormalizedLedgerEntry {
  receipt_index: number;
  item_name: string;
  amount: string;
  currency: string;
  category_index: number;
  notes: string | null;
}

export interface NormalizedOrderAdjustment {
  receipt_index: number;
  item_name: string;
  amount: string;
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

function fallbackTitleForOutcome(
  output: z.infer<typeof parserOutputSchema>,
  aiLanguage?: string
): string {
  const copy = getAiOutputCopy(aiLanguage);
  switch (output.outcome) {
    case "invalid":
      return copy.invalidContent;
    case "anomaly":
      return copy.unparseableDocument;
    default:
      return copy.untitledDocument;
  }
}

function normalizeTitle(output: z.infer<typeof parserOutputSchema>, aiLanguage?: string): string {
  const title = output.title?.trim();
  return title != null && title !== "" ? title : fallbackTitleForOutcome(output, aiLanguage);
}

function normalizeSuccessfulExpenseAmount(amount: string): string {
  return compare(amount, "0") < 0 ? new Decimal(amount).abs().toFixed() : amount;
}

// ===== Normalization =====

export function normalizeResult(
  output: z.infer<typeof parserOutputSchema>,
  aiLanguage?: string
): NormalizedParseOutput {
  // A debit is frequently rendered with a minus sign in banking and app UIs.
  // For a successful expense parse the sign is presentation, not an expense direction.
  const ledgerEntries =
    output.outcome === "success"
      ? output.ledger_entries.map((entry) => ({
          ...entry,
          amount: normalizeSuccessfulExpenseAmount(entry.amount),
        }))
      : output.ledger_entries;
  const receiptTotals =
    output.outcome === "success"
      ? output.receipt_totals.map((total) => ({
          ...total,
          amount: normalizeSuccessfulExpenseAmount(total.amount),
        }))
      : output.receipt_totals;

  // Zero cannot represent a usable expense. Negative successful entries above
  // have already been normalized from debit-display notation.
  const invalidEntry = ledgerEntries.find((entry) => compare(entry.amount, "0") <= 0);
  if (invalidEntry != null) {
    return {
      outcome: "anomaly",
      anomaly_reason: `ledger_entry "${invalidEntry.item_name}" has non-positive amount ${invalidEntry.amount} — likely an order-level adjustment misclassified as a line item`,
      title: normalizeTitle(output, aiLanguage),
      receipt_count: output.receipt_count,
      receipt_totals: receiptTotals,
      ledger_entries: [],
      order_adjustments: output.order_adjustments,
      reasoning: output.reasoning,
    };
  }

  return {
    outcome: output.outcome,
    ...(output.anomaly_reason != null ? { anomaly_reason: output.anomaly_reason } : {}),
    title: normalizeTitle(output, aiLanguage),
    receipt_count: output.receipt_count,
    receipt_totals: receiptTotals,
    ledger_entries: ledgerEntries.map((e) => ({
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

function groupTotals(
  entries: { currency: string; category_index: number; amount: string }[]
): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, e) => {
    const key = `${e.currency}:${e.category_index}`;
    const prev = acc[key];
    acc[key] = prev != null ? new Decimal(prev).plus(e.amount).toFixed() : e.amount;
    return acc;
  }, {});
}

function groupAdjustments(
  adjustments: { currency: string; amount: string }[]
): Record<string, string> {
  return adjustments.reduce<Record<string, string>>((acc, a) => {
    const prev = acc[a.currency];
    acc[a.currency] = prev != null ? new Decimal(prev).plus(a.amount).toFixed() : a.amount;
    return acc;
  }, {});
}

function groupReceiptTotals(
  totals: { receipt_index: number; currency: string; amount: string }[]
): Record<string, string> {
  return totals.reduce<Record<string, string>>((acc, total) => {
    const key = `${total.receipt_index}:${total.currency}`;
    const prev = acc[key];
    acc[key] = prev != null ? new Decimal(prev).plus(total.amount).toFixed() : total.amount;
    return acc;
  }, {});
}

function mapsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.join("|") !== bKeys.join("|")) return false;
  return aKeys.every((k) => {
    const diff = new Decimal(a[k] ?? "0").minus(b[k] ?? "0").abs();
    return diff.lte("0.01");
  });
}

/**
 * Returns true when two normalized results are close enough to be treated as consistent.
 * Compares receipt totals, entry grouped sums, and adjustment grouped sums.
 */
export function compareResults(left: NormalizedParseOutput, right: NormalizedParseOutput): boolean {
  if (left.outcome !== right.outcome) return false;
  if (left.ledger_entries.length !== right.ledger_entries.length) return false;
  if (left.order_adjustments.length !== right.order_adjustments.length) return false;

  // Compare receipt totals
  if (
    !mapsMatch(groupReceiptTotals(left.receipt_totals), groupReceiptTotals(right.receipt_totals))
  ) {
    return false;
  }

  // Compare entry grouped sums
  if (!mapsMatch(groupTotals(left.ledger_entries), groupTotals(right.ledger_entries))) return false;

  // Compare adjustment grouped sums
  if (
    !mapsMatch(groupAdjustments(left.order_adjustments), groupAdjustments(right.order_adjustments))
  )
    return false;

  return true;
}
