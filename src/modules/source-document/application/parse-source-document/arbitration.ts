/**
 * Arbitration
 *
 * When two independent parse runs disagree, an arbitration call picks the
 * better result. The arbitrator receives both normalized outputs and the
 * original input, then returns the chosen result as a NormalizedParseOutput.
 */

import type { AIContext, AIMessageContentPart } from "@/lib/flow/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSuccessfulLoadImageResult, loadImagesForAI } from "@/lib/storage/utils";
import { z } from "zod";
import type { NormalizedParseOutput } from "./parser-schema";
import { parserOutputSchema, normalizeResult } from "./parser-schema";
import type { ParserInput } from "./parser";

const arbitrationChoiceSchema = z.object({
  choice: z.number().int().min(1).max(2),
  reason: z.string(),
});

function buildArbitrationPrompt(
  input: ParserInput,
  result1: NormalizedParseOutput,
  result2: NormalizedParseOutput
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
  input: ParserInput,
  result1: NormalizedParseOutput,
  result2: NormalizedParseOutput
): string {
  const textSection = input.text != null && input.text !== "" ? `\nDocument Text:\n${input.text}\n` : "";
  return `You are a receipt and invoice parser arbitration AI. Two independent parsers produced conflicting results. Produce the correct final parse result by reviewing the original document and both attempts.${textSection}
Result 1:
${JSON.stringify(result1, null, 2)}

Result 2:
${JSON.stringify(result2, null, 2)}

Return the corrected final result as a JSON block matching the parser output format. Return only the JSON block, no other text.`;
}

async function buildArbitrationMessageContent(
  imageUrls: string[] | undefined
): Promise<AIMessageContentPart[]> {
  const content: AIMessageContentPart[] = [
    { type: "text", text: "Please arbitrate these parse results." },
  ];

  if ((imageUrls?.length ?? 0) > 0) {
    const loaded = await loadImagesForAI(imageUrls!);
    const images = loaded
      .filter(isSuccessfulLoadImageResult)
      .map((r) => ({ dataUrl: r.dataUrl }));
    content.push(
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: image.dataUrl },
      }))
    );
  }

  return content;
}

export type ArbitrationResult =
  | { kind: "chosen"; result: NormalizedParseOutput; wasArbitrated: boolean }
  | { kind: "anomaly"; reason: string };

export async function arbitrateResults(
  {
    input,
    result1,
    result2,
  }: {
    input: ParserInput;
    result1: NormalizedParseOutput;
    result2: NormalizedParseOutput;
  },
  ai: AIContext
): Promise<ArbitrationResult> {
  const hasImages = (input.imageUrls?.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";
  const messageContent = await buildArbitrationMessageContent(input.imageUrls);

  // Step 1: choose which result is better
  const choicePrompt = buildArbitrationPrompt(input, result1, result2);
  const choiceResponse = await ai.generate({
    model,
    prompt: choicePrompt,
    messages: [{ role: "user", content: messageContent }],
  });

  let choiceRaw: unknown;
  try {
    const content = choiceResponse.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    choiceRaw = JSON.parse(content);
  } catch (e) {
    throw new AppError(
      `arbitration: failed to parse choice response: ${String(e)}`,
      "AI_PARSE_ERROR"
    );
  }

  const parsedChoice = arbitrationChoiceSchema.safeParse(choiceRaw);
  if (!parsedChoice.success) {
    logger.warn({ error: parsedChoice.error.message }, "arbitration: invalid choice schema, falling back to result correction");
  } else {
    const chosen = parsedChoice.data.choice === 1 ? result1 : result2;
    logger.info({ choice: parsedChoice.data.choice, reason: parsedChoice.data.reason }, "arbitration: chose result");
    return { kind: "chosen", result: chosen, wasArbitrated: true };
  }

  // Step 2: fallback — ask AI to produce corrected result
  const correctionPrompt = buildArbitrationResultPrompt(input, result1, result2);
  const correctedResponse = await ai.generate({
    model,
    prompt: correctionPrompt,
    messages: [{ role: "user", content: messageContent }],
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
      `arbitration: failed to parse corrected result: ${String(e)}`,
      "AI_PARSE_ERROR"
    );
  }

  const parsedCorrected = parserOutputSchema.safeParse(raw);
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
