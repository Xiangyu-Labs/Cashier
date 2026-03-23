import { z } from "zod";
import type { ParsedEntry } from "./types";
import type { Stage2Output } from "./stage2-executor";

const entrySchema = z.object({
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0),
  entry_date: z.string().optional(),
  notes: z.string().nullable(),
});

export const stage2ParseOutputSchema = z.object({
  ledger_entries: z.array(entrySchema),
  reasoning: z.string(),
});

export type NormalizedStage2ParseResult = {
  ledger_entries: ParsedEntry[];
  reasoning: string;
};

export function normalizeStage2ParseResult(
  output: z.infer<typeof stage2ParseOutputSchema>
): NormalizedStage2ParseResult {
  return {
    ledger_entries: output.ledger_entries.map((entry) => ({
      item_name: entry.item_name,
      amount: entry.amount,
      currency: entry.currency,
      category_index: entry.category_index,
      notes: entry.notes,
      ...(entry.entry_date !== undefined ? { entry_date: entry.entry_date } : {}),
    })),
    reasoning: output.reasoning,
  };
}

export function compareParsedEntries(left: ParsedEntry[], right: ParsedEntry[]): boolean {
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
