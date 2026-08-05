/**
 * Arbitration
 *
 * When two independent parse runs disagree, an arbitration call picks the
 * better result. The arbitrator receives both normalized outputs and the
 * original input, then returns the chosen result as a NormalizedParseOutput.
 */

import {
  ProcessingFailure,
  type AiContextContract,
  type AiMessageContentPart as AIMessageContentPart,
} from "./contracts";
import { logger } from "@/lib/logger";
import { z } from "zod";
import type { NormalizedParseOutput } from "./parser-schema";
import { parserOutputSchema, normalizeResult } from "./parser-schema";
import type { ParserInput } from "./parser";
import { buildAiOutputLocaleInstruction } from "@/config/ai-output-locales";
import { TITLE_POLICY_PROMPT } from "@/modules/source-document/title-policy";

const arbitrationChoiceSchema = z.object({
  choice: z.number().int().min(0).max(2),
  reason: z.string(),
});

function buildArbitrationContext(input: ParserInput): string {
  const categorySection = `\nExpense categories:\n${JSON.stringify(input.originalCategories, null, 2)}\n`;
  const currencySection =
    (input.preferredCurrencies?.length ?? 0) > 0
      ? `\nPreferred currencies when ambiguous: ${input.preferredCurrencies!.join(", ")}\n`
      : "";
  const customSection =
    input.aiCustomPrompt != null && input.aiCustomPrompt !== ""
      ? `\nAdditional Instructions:\n${input.aiCustomPrompt}\n`
      : "";
  const titlePolicySection = `\n${TITLE_POLICY_PROMPT}\n`;

  return `${categorySection}${currencySection}${customSection}\n${buildAiOutputLocaleInstruction(input.aiLanguage)}\n${titlePolicySection}`;
}

function buildArbitrationPrompt(
  input: ParserInput,
  result1: NormalizedParseOutput,
  result2: NormalizedParseOutput
): string {
  const textSection =
    input.text != null && input.text !== "" ? `\nDocument Text:\n${input.text}\n` : "";
  const context = buildArbitrationContext(input);
  return `You are a receipt and invoice parser arbitration AI. Two independent parsers produced different results for the same document. Choose the more accurate result.${textSection}
Result 1:
${JSON.stringify(result1, null, 2)}

Result 2:
${JSON.stringify(result2, null, 2)}
${context}
Choose a result only if it is factually correct and can be used unchanged under all instructions above. Choose 0 if neither result qualifies, including when neither follows the mandatory output locale.

Respond with JSON only:
\`\`\`json
{ "choice": 1, "reason": "brief explanation" }
\`\`\`

Set "choice" to 0, 1, or 2.`;
}

function buildArbitrationResultPrompt(
  input: ParserInput,
  result1: NormalizedParseOutput,
  result2: NormalizedParseOutput
): string {
  const textSection =
    input.text != null && input.text !== "" ? `\nDocument Text:\n${input.text}\n` : "";
  const context = buildArbitrationContext(input);
  return `You are a receipt and invoice parser arbitration AI. Two independent parsers produced conflicting results. Produce the correct final parse result by reviewing the original document and both attempts.${textSection}
Result 1:
${JSON.stringify(result1, null, 2)}

Result 2:
${JSON.stringify(result2, null, 2)}
${context}

Return the corrected final result as a JSON block matching the parser output format. Return only the JSON block, no other text.`;
}

function buildArbitrationMessageContent(input: ParserInput): AIMessageContentPart[] {
  const content: AIMessageContentPart[] = [
    { type: "text", text: "Please arbitrate these parse results." },
  ];

  const images = input.evidence?.images ?? [];
  if (images.length > 0) {
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

async function generateForArbitration(
  ai: AiContextContract,
  options: Parameters<AiContextContract["generate"]>[0]
) {
  try {
    return await ai.generate(options);
  } catch (error) {
    if (error instanceof ProcessingFailure) throw error;
    throw new ProcessingFailure("ai_provider_unavailable", "Arbitration AI request failed", {
      cause: error,
    });
  }
}

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
  ai: AiContextContract
): Promise<ArbitrationResult> {
  const hasImages = (input.evidence?.images.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";
  const messageContent = buildArbitrationMessageContent(input);

  // Step 1: choose which result is better
  const choicePrompt = buildArbitrationPrompt(input, result1, result2);
  const choiceResponse = await generateForArbitration(ai, {
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
    throw new ProcessingFailure(
      "ai_schema_invalid",
      "Arbitration choice response was not valid JSON",
      { cause: e }
    );
  }

  const parsedChoice = arbitrationChoiceSchema.safeParse(choiceRaw);
  if (!parsedChoice.success) {
    logger.warn(
      { error: parsedChoice.error.message },
      "arbitration: invalid choice schema, falling back to result correction"
    );
  } else if (parsedChoice.data.choice !== 0) {
    const chosen = parsedChoice.data.choice === 1 ? result1 : result2;
    logger.info(
      { choice: parsedChoice.data.choice, reason: parsedChoice.data.reason },
      "arbitration: chose result"
    );
    return { kind: "chosen", result: chosen, wasArbitrated: true };
  }

  // Step 2: fallback — ask AI to produce corrected result
  const correctionPrompt = buildArbitrationResultPrompt(input, result1, result2);
  const correctedResponse = await generateForArbitration(ai, {
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
    throw new ProcessingFailure(
      "ai_schema_invalid",
      "Arbitration corrected response was not valid JSON",
      { cause: e }
    );
  }

  const parsedCorrected = parserOutputSchema.safeParse(raw);
  if (!parsedCorrected.success) {
    throw new ProcessingFailure(
      "ai_schema_invalid",
      "Arbitration corrected response failed schema validation",
      { cause: parsedCorrected.error }
    );
  }

  const normalized = normalizeResult(parsedCorrected.data, input.aiLanguage);
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
