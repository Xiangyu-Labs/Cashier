import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext } from "@/lib/flow/types";
import type { DocumentUnderstanding, ParsedEntry } from "./types";
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
  documentUnderstanding?: DocumentUnderstanding;
  aiLanguage?: string;
  preferredCurrencies?: string[];
  originalCategories: { name: string; description: string | null }[];
  aiCustomPrompt?: string;
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

async function runDualParsingCalls(
  ai: AIContext,
  prompt: string,
  messageContent: ReturnType<typeof buildMessageContent>
) {
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
  const messageContent = buildMessageContent(
    input.text,
    input.imageUrls,
    undefined,
    input.documentUnderstanding
  );

  const prompt = buildDetailedParsePrompt({
    ...(input.documentUnderstanding !== undefined ? { documentUnderstanding: input.documentUnderstanding } : {}),
    ...(input.preferredCurrencies !== undefined ? { preferredCurrencies: input.preferredCurrencies } : {}),
    categories: input.originalCategories,
    ...(input.aiCustomPrompt !== undefined ? { aiCustomPrompt: input.aiCustomPrompt } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  });

  const [result1, result2] = await runDualParsingCalls(ai, prompt, messageContent);

  // If both runs indicate anomaly, return anomaly immediately
  if (result1.outcome === "anomaly" && result2.outcome === "anomaly") {
    return {
      kind: "anomaly",
      reason: result1.anomaly_reason ?? "Document cannot be parsed",
    };
  }

  // If one is anomaly and one is success, arbitrate
  const entriesToCompare1 = result1.outcome === "success" ? result1.ledger_entries : [];
  const entriesToCompare2 = result2.outcome === "success" ? result2.ledger_entries : [];

  if (
    result1.outcome === "success" &&
    result2.outcome === "success" &&
    compareParsedEntries(entriesToCompare1, entriesToCompare2)
  ) {
    return {
      kind: "success",
      output: buildStage2SuccessOutput(
        result1.ledger_entries,
        result1.reasoning,
        result1.title,
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

  const chosen = chosenResult.result;

  if (chosen.outcome === "anomaly") {
    return {
      kind: "anomaly",
      reason: chosen.anomaly_reason ?? "Arbitrated result indicates anomaly",
    };
  }

  return {
    kind: "success",
    output: buildStage2SuccessOutput(
      chosen.ledger_entries,
      chosen.reasoning,
      chosen.title,
      true
    ),
  };
}
