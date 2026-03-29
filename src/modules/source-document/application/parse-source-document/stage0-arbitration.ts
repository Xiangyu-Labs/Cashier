/**
 * Stage 0 Arbitration
 *
 * When two independent parse runs disagree, an arbitration call picks the
 * better result. The arbitrator receives both normalized outputs and the
 * original input, then returns the chosen result as a NormalizedStage0ParseOutput.
 */

import type { AIContext, AIMessageContentPart } from "@/lib/flow/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { loadImagesForAI } from "@/lib/storage/utils";
import { z } from "zod";
import type { NormalizedStage0ParseOutput } from "./stage0-schema";
import { stage0ParseOutputSchema, normalizeResult } from "./stage0-schema";
import type { Stage0Input } from "./stage0-vision";

const arbitrationChoiceSchema = z.object({
  choice: z.number().int().min(1).max(2),
  reason: z.string(),
});

function buildArbitrationPrompt(
  input: Stage0Input,
  result1: NormalizedStage0ParseOutput,
  result2: NormalizedStage0ParseOutput
): string {
  const textSection = input.text != null && input.text !== "" ? `\nDocument Text:\n${input.text}\n` : "";
  return `You are a receipt and invoice parser arbitration AI. Two independent parsers produced different results for the same document. Choose the more accurate result.${textSection}
Result 1:
${JSON.stringify(result1, null, 2)}

Result 2:
${JSON.stringify(result2, null, 2)}

Respond with JSON only:
\`\`\`json
{ "choice": 1, "reason": "brief explanation" }
\`\`\`

Set "choice" to 1 or 2. Do not choose 0 or any other value.`;
}

function buildArbitrationResultPrompt(
  input: Stage0Input,
  result1: NormalizedStage0ParseOutput,
  result2: NormalizedStage0ParseOutput
): string {
  const textSection = input.text != null && input.text !== "" ? `\nDocument Text:\n${input.text}\n` : "";
  return `You are a receipt and invoice parser arbitration AI. Two independent parsers produced conflicting results. Produce the correct final parse result by reviewing the original document and both attempts.${textSection}
Result 1:
${JSON.stringify(result1, null, 2)}

Result 2:
${JSON.stringify(result2, null, 2)}

Return a final corrected JSON parse result using exactly the same schema as the inputs (outcome, title, receipt_count, receipt_totals, ledger_entries, order_adjustments, reasoning). JSON only, no other text.`;
}

export type ArbitrationOutcome =
  | { kind: "chosen"; result: NormalizedStage0ParseOutput; wasArbitrated: true }
  | { kind: "anomaly"; reason: string };

export async function arbitrateStage0Results(
  params: {
    input: Stage0Input;
    result1: NormalizedStage0ParseOutput;
    result2: NormalizedStage0ParseOutput;
  },
  ai: AIContext
): Promise<ArbitrationOutcome> {
  const { input, result1, result2 } = params;
  const hasImages = (input.imageUrls?.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";

  logger.debug("stage0-arbitration: starting arbitration");

  // Load images once and reuse for both calls
  let imageContent: AIMessageContentPart[] = [];
  if (hasImages) {
    const loaded = await loadImagesForAI(input.imageUrls!);
    imageContent = loaded
      .filter((r) => r.success)
      .map((r) => ({ type: "image_url" as const, image_url: { url: r.dataUrl } }));
  }
  const userMessages = [{ role: "user" as const, content: imageContent }];

  // First: ask which result is better
  const choiceResponse = await ai.generate({
    model,
    prompt: buildArbitrationPrompt(input, result1, result2),
    messages: userMessages,
  });

  let choice: number;
  try {
    const content = choiceResponse.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    const parsed = arbitrationChoiceSchema.parse(JSON.parse(content));
    choice = parsed.choice;
  } catch {
    // If choice parsing fails, do a full re-parse arbitration
    choice = 0;
  }

  if (choice === 1) {
    logger.debug("stage0-arbitration: chose result 1");
    return { kind: "chosen", result: result1, wasArbitrated: true };
  }

  if (choice === 2) {
    logger.debug("stage0-arbitration: chose result 2");
    return { kind: "chosen", result: result2, wasArbitrated: true };
  }

  // choice === 0: arbitration failed to pick — ask for a corrected result
  logger.debug("stage0-arbitration: no clear choice, requesting corrected result");

  const correctedResponse = await ai.generate({
    model,
    prompt: buildArbitrationResultPrompt(input, result1, result2),
    messages: userMessages,
  });

  let raw: unknown;
  try {
    const content = correctedResponse.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    raw = JSON.parse(content);
  } catch (e) {
    throw new AppError(
      `stage0-arbitration: failed to parse corrected result: ${String(e)}`,
      "AI_PARSE_ERROR"
    );
  }

  const parsedCorrected = stage0ParseOutputSchema.safeParse(raw);
  if (!parsedCorrected.success) {
    return {
      kind: "anomaly",
      reason: "Arbitration produced an invalid result",
    };
  }

  const normalized = normalizeResult(parsedCorrected.data);
  if (normalized.outcome === "anomaly") {
    return {
      kind: "anomaly",
      reason: normalized.anomaly_reason ?? "Arbitrated result indicates anomaly",
    };
  }

  if (normalized.outcome === "invalid") {
    return {
      kind: "anomaly",
      reason: "Arbitrated result indicates document is invalid",
    };
  }

  return { kind: "chosen", result: normalized, wasArbitrated: true };
}
