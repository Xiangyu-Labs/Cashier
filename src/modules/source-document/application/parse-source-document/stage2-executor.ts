import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext } from "@/lib/flow/types";
import type { ParsedEntry, ValidationSummary } from "./types";
import { buildDetailedParsePrompt } from "./stage2-prompts";
import { buildMessageContent } from "./message-content";
import { arbitrateStage2Results } from "./stage2-arbitration";
import {
  buildStage2SuccessOutput,
  compareParsedEntries,
  normalizeStage2ParseResult,
  stage2ParseOutputSchema,
} from "./stage2-result-policy";

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

async function runDualParsingCalls(ai: AIContext, prompt: string, messageContent: ReturnType<typeof buildMessageContent>) {
  const [response1, response2] = await Promise.all([
    ai.generate({
      prompt,
      messages: [{ role: "user", content: messageContent }],
      requireJson: true,
      model: "text",
    }),
    ai.generate({
      prompt,
      messages: [{ role: "user", content: messageContent }],
      requireJson: true,
      model: "text",
    }),
  ]);

  return [
    normalizeStage2ParseResult(parseJsonResponse(response1.content, stage2ParseOutputSchema)),
    normalizeStage2ParseResult(parseJsonResponse(response2.content, stage2ParseOutputSchema)),
  ] as const;
}

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

  const [result1, result2] = await runDualParsingCalls(ai, prompt, messageContent);

  if (compareParsedEntries(result1.ledger_entries, result2.ledger_entries)) {
    return {
      kind: "success",
      output: buildStage2SuccessOutput(
        result1.ledger_entries,
        result1.reasoning,
        input.validationSummary.summary?.title,
        false
      ),
    };
  }

  const chosenResult = await arbitrateStage2Results(ai, messageContent, result1, result2);

  if (chosenResult.kind === "anomaly") {
    return {
      kind: "anomaly",
      reason: chosenResult.reason,
    };
  }

  return {
    kind: "success",
    output: buildStage2SuccessOutput(
      chosenResult.result.ledger_entries,
      chosenResult.result.reasoning,
      input.validationSummary.summary?.title,
      true
    ),
  };
}
