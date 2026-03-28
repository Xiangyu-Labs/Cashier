import { z } from "zod";
import type { ParsedEntry } from "./types";
import type { Stage2Output } from "./stage2-executor";

const entrySchema = z.object({
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

export const stage2ParseOutputSchema = z.object({
  outcome: z.enum(["success", "anomaly"]).default("success"),
  anomaly_reason: z.string().nullish(),
  title: z.string().optional(),
  currencies: z
    .array(z.object({ code: z.string(), hint: z.string() }))
    .optional(),
  categories: z
    .array(z.object({ name: z.string(), hint: z.string() }))
    .optional(),
  ledger_entries: z.array(entrySchema),
  reasoning: z.string(),
});

export type NormalizedStage2ParseResult = {
  outcome: "success" | "anomaly";
  anomaly_reason?: string;
  title?: string;
  ledger_entries: ParsedEntry[];
  reasoning: string;
};

export function normalizeStage2ParseResult(
  output: z.infer<typeof stage2ParseOutputSchema>
): NormalizedStage2ParseResult {
  return {
    outcome: output.outcome,
    ...(output.anomaly_reason != null ? { anomaly_reason: output.anomaly_reason } : {}),
    ...(output.title !== undefined ? { title: output.title } : {}),
    ledger_entries: output.ledger_entries.map((entry) => ({
      item_name: entry.item_name,
      amount: entry.amount,
      currency: entry.currency,
      category_index: entry.category_index,
      notes: entry.notes ?? null,
    })),
    reasoning: output.reasoning,
  };
}

export function compareParsedEntries(left: ParsedEntry[], right: ParsedEntry[]): boolean {
  // If both are anomalies, treat as matching
  if (left.length === 0 && right.length === 0) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  const groupTotals = (entries: ParsedEntry[]) =>
    entries.reduce<Record<string, number>>((groups, entry) => {
      const key = `${entry.currency}:${entry.category_index}`;
      groups[key] = (groups[key] ?? 0) + entry.amount;
      return groups;
    }, {});

  const leftTotals = groupTotals(left);
  const rightTotals = groupTotals(right);
  const leftKeys = Object.keys(leftTotals).sort();
  const rightKeys = Object.keys(rightTotals).sort();

  if (leftKeys.join("|") !== rightKeys.join("|")) {
    return false;
  }

  return leftKeys.every((key) => Math.abs((leftTotals[key] ?? 0) - (rightTotals[key] ?? 0)) <= 0.01);
}

export function buildStage2SuccessOutput(
  entries: ParsedEntry[],
  reasoning: string,
  title: string | undefined,
  wasArbitrated: boolean
): Stage2Output {
  return {
    entries,
    title: title ?? "Untitled",
    reasoning,
    wasArbitrated,
  };
}
