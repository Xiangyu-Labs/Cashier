import { z } from "zod";
import Decimal from "decimal.js";
import { isValidDecimal, compare } from "@/lib/money/decimal";
import { getAiOutputCopy } from "@/config/ai-output-locales";
import { normalizeTitle } from "@/modules/source-document/title-policy";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";

// ===== Decimal string validation =====

/**
 * Zod type for canonical decimal strings.
 * Rejects raw JSON numbers — the AI must output quoted strings.
 */
const decimalStringSchema = z
  .string()
  .refine((v) => isValidDecimal(v), {
    message: 'Must be a valid decimal number string (e.g. "45.00")',
  })
  .refine((value) => /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,3})?$/.test(value), {
    message: "Amount exceeds numeric(21,3)",
  });
const supportedCurrencySchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine(
    (value): value is (typeof SUPPORTED_CURRENCIES)[number] =>
      (SUPPORTED_CURRENCIES as readonly string[]).includes(value),
    "Unsupported currency"
  );

// ===== Raw Zod schema (AI response shape) =====

const receiptTotalSchema = z.object({
  receipt_index: z.number().int().min(0),
  amount: decimalStringSchema,
  currency: supportedCurrencySchema,
});

const ledgerEntrySchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: decimalStringSchema,
  currency: supportedCurrencySchema,
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

const orderAdjustmentSchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string(),
  amount: decimalStringSchema,
  currency: supportedCurrencySchema,
});

export const parserOutputSchema = z
  .object({
    outcome: z.enum(["success", "invalid", "anomaly"]).default("success"),
    anomaly_reason: z.string().nullish(),
    title: z.string().nullish(),
    receipt_count: z.number().int().min(0).default(1),
    receipt_totals: z.array(receiptTotalSchema).default([]),
    ledger_entries: z.array(ledgerEntrySchema).default([]),
    order_adjustments: z.array(orderAdjustmentSchema).default([]),
    reasoning: z.string(),
  })
  .superRefine((output, ctx) => {
    if (output.outcome !== "success") return;
    if (output.receipt_count < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["receipt_count"],
        message: "Successful output requires a receipt",
      });
      return;
    }
    const expected = new Set(Array.from({ length: output.receipt_count }, (_, index) => index));
    const totalsByIndex = new Map<number, number>();
    output.receipt_totals.forEach((total, index) => {
      totalsByIndex.set(total.receipt_index, (totalsByIndex.get(total.receipt_index) ?? 0) + 1);
      if (!expected.has(total.receipt_index)) {
        ctx.addIssue({
          code: "custom",
          path: ["receipt_totals", index, "receipt_index"],
          message: "Receipt index is outside receipt_count",
        });
      }
    });
    for (const receiptIndex of expected) {
      if (totalsByIndex.get(receiptIndex) !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["receipt_totals"],
          message: `Receipt ${receiptIndex} must have exactly one total`,
        });
      }
    }
    for (const [field, values] of [
      ["ledger_entries", output.ledger_entries],
      ["order_adjustments", output.order_adjustments],
    ] as const) {
      values.forEach((value, index) => {
        if (!expected.has(value.receipt_index)) {
          ctx.addIssue({
            code: "custom",
            path: [field, index, "receipt_index"],
            message: "Receipt index is outside receipt_count",
          });
        }
      });
    }
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
      title: normalizeTitle(output.title, fallbackTitleForOutcome(output, aiLanguage)),
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
    title: normalizeTitle(output.title, fallbackTitleForOutcome(output, aiLanguage)),
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

function normalizeSignatureText(value: string | null): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function entrySignatures(entries: NormalizedLedgerEntry[]): string[] {
  return entries
    .map((entry) =>
      JSON.stringify([
        entry.receipt_index,
        normalizeSignatureText(entry.item_name),
        new Decimal(entry.amount).toFixed(),
        entry.currency,
        entry.category_index,
        normalizeSignatureText(entry.notes),
      ])
    )
    .sort();
}

function adjustmentSignatures(adjustments: NormalizedOrderAdjustment[]): string[] {
  return adjustments
    .map((adjustment) =>
      JSON.stringify([
        adjustment.receipt_index,
        normalizeSignatureText(adjustment.item_name),
        new Decimal(adjustment.amount).toFixed(),
        adjustment.currency,
      ])
    )
    .sort();
}

function receiptTotalSignatures(totals: NormalizedReceiptTotal[]): string[] {
  return totals
    .map((total) =>
      JSON.stringify([total.receipt_index, new Decimal(total.amount).toFixed(), total.currency])
    )
    .sort();
}

function signaturesMatch(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((signature, index) => signature === right[index])
  );
}

/**
 * Returns true when two normalized results are close enough to be treated as consistent.
 * Compares receipt totals, entry grouped sums, and adjustment grouped sums.
 */
export function compareResults(left: NormalizedParseOutput, right: NormalizedParseOutput): boolean {
  if (left.outcome !== right.outcome) return false;
  if (left.ledger_entries.length !== right.ledger_entries.length) return false;
  if (left.order_adjustments.length !== right.order_adjustments.length) return false;

  return (
    signaturesMatch(
      receiptTotalSignatures(left.receipt_totals),
      receiptTotalSignatures(right.receipt_totals)
    ) &&
    signaturesMatch(entrySignatures(left.ledger_entries), entrySignatures(right.ledger_entries)) &&
    signaturesMatch(
      adjustmentSignatures(left.order_adjustments),
      adjustmentSignatures(right.order_adjustments)
    )
  );
}
