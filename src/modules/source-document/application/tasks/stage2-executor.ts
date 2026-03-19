/**
 * Stage 2 Executor
 *
 * Detailed parsing using dual GPT + arbitration.
 * Takes Stage 1.5 validation summary as context.
 */

import { z } from "zod";
import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext, AIModelTier } from "@/lib/flow/types";
import type { ValidationSummary, ParsedEntry } from "./types";
import { buildDetailedParsePrompt } from "./stage2-prompts";
import { buildMessageContent } from "./message-content";

// ===== Zod Schema for Output =====

const entrySchema = z.object({
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0), // 0 = no category, 1+ = index
  entry_date: z.string().optional(), // Optional: we use source document's entryDate instead
  notes: z.string().nullable(),
});

const parseOutputSchema = z.object({
  ledger_entries: z.array(entrySchema),
  reasoning: z.string(),
});

// ===== Helper: Compare Entry Arrays =====

function compareEntries(entries1: ParsedEntry[], entries2: ParsedEntry[]): boolean {
  if (entries1.length !== entries2.length) return false;

  // Group by currency and category, compare totals
  const groupTotals = (entries: ParsedEntry[]) => {
    const groups: Record<string, number> = {};
    for (const e of entries) {
      const key = `${e.currency}:${e.category_index}`;
      groups[key] = (groups[key] ?? 0) + e.amount;
    }
    return groups;
  };

  const totals1 = groupTotals(entries1);
  const totals2 = groupTotals(entries2);

  const keys1 = Object.keys(totals1).sort();
  const keys2 = Object.keys(totals2).sort();

  if (keys1.join(",") !== keys2.join(",")) return false;

  // Allow small floating point differences
  for (const key of keys1) {
    if (Math.abs(totals1[key] - totals2[key]) > 0.01) return false;
  }

  return true;
}

// Arbitration result schema
const arbitrationSchema = z.object({
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string().optional(),
});

// ===== Helper: Build Arbitration Prompt =====

function buildStage2ArbitrationPrompt<T>(result1: T, result2: T): string {
  return `You are an arbitration AI for financial document parsing.

### Task Description
Determine which parsing result is more accurate for the given financial document.

### GPT 1 Result
${JSON.stringify(result1, null, 2)}

### GPT 2 Result
${JSON.stringify(result2, null, 2)}

### Your Task
Compare the two results and determine which is more accurate.
- Return choice: 1 to use GPT 1's result
- Return choice: 2 to use GPT 2's result
- Return choice: 0 if both have fundamental issues (mark as anomaly)

Look for:
- Correct amounts matching the document
- Proper categorization
- Reasonable date handling

### Output (raw JSON only)
{"choice": 1 | 2 | 0, "reason": "..."}`;
}

// ===== Stage 2 Input/Output Types =====

export interface Stage2Input {
  text?: string;
  imageUrls?: string[];
  visionDescription?: string;
  aiLanguage?: string;
  validationSummary: ValidationSummary;
  originalCategories: { name: string; description: string | null }[];
}

export interface Stage2Output {
  entries: ParsedEntry[];
  title: string;
  reasoning: string;
  wasArbitrated: boolean;
}

export type Stage2ExecutionResult =
  | {
      kind: "success";
      output: Stage2Output;
    }
  | {
      kind: "anomaly";
      reason: string;
    };

// ===== Helper: Run Dual GPT Calls =====

async function runDualParsingCalls(
  ai: AIContext,
  prompt: string,
  messageContent: ReturnType<typeof buildMessageContent>
): Promise<
  [
    { ledger_entries: ParsedEntry[]; reasoning: string },
    { ledger_entries: ParsedEntry[]; reasoning: string },
  ]
> {
  const model: AIModelTier = "text";

  const [response1, response2] = await Promise.all([
    ai.generate({
      prompt,
      messages: [{ role: "user", content: messageContent }],
      requireJson: true,
      model,
    }),
    ai.generate({
      prompt,
      messages: [{ role: "user", content: messageContent }],
      requireJson: true,
      model,
    }),
  ]);

  const result1 = parseJsonResponse(response1.content, parseOutputSchema);
  const result2 = parseJsonResponse(response2.content, parseOutputSchema);

  return [result1, result2];
}

// ===== Helper: Run Arbitration =====

async function runStage2Arbitration(
  ai: AIContext,
  messageContent: ReturnType<typeof buildMessageContent>,
  result1: { ledger_entries: ParsedEntry[]; reasoning: string },
  result2: { ledger_entries: ParsedEntry[]; reasoning: string }
): Promise<
  | {
      kind: "chosen";
      result: { ledger_entries: ParsedEntry[]; reasoning: string };
    }
  | {
      kind: "anomaly";
      reason: string;
    }
> {
  const arbitrationPrompt = buildStage2ArbitrationPrompt(result1, result2);

  const arbitrationResponse = await ai.generate({
    prompt: arbitrationPrompt,
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  const arbitrationResult = parseJsonResponse(arbitrationResponse.content, arbitrationSchema);

  if (arbitrationResult.choice === 0) {
    return {
      kind: "anomaly",
      reason: arbitrationResult.reason ?? "Both parsing results invalid",
    };
  }

  return {
    kind: "chosen",
    result: arbitrationResult.choice === 1 ? result1 : result2,
  };
}

// ===== Main Stage 2 Executor =====

export async function executeStage2(
  input: Stage2Input,
  ai: AIContext
): Promise<Stage2ExecutionResult> {
  const messageContent = buildMessageContent(input.text, input.imageUrls, input.visionDescription);

  const prompt = buildDetailedParsePrompt(
    input.validationSummary,
    input.originalCategories,
    input.aiLanguage
  );

  // Run dual GPT calls
  const [result1, result2] = await runDualParsingCalls(ai, prompt, messageContent);

  // Compare results
  if (compareEntries(result1.ledger_entries, result2.ledger_entries)) {
    return {
      kind: "success",
      output: {
        entries: result1.ledger_entries,
        title: input.validationSummary.summary?.title ?? "Untitled",
        reasoning: result1.reasoning,
        wasArbitrated: false,
      },
    };
  }

  // Arbitration needed
  const chosenResult = await runStage2Arbitration(ai, messageContent, result1, result2);

  if (chosenResult.kind === "anomaly") {
    return {
      kind: "anomaly",
      reason: chosenResult.reason,
    };
  }

  return {
    kind: "success",
    output: {
      entries: chosenResult.result.ledger_entries,
      title: input.validationSummary.summary?.title ?? "Untitled",
      reasoning: chosenResult.result.reasoning,
      wasArbitrated: true,
    },
  };
}
