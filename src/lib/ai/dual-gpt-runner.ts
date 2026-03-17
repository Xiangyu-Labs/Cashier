/**
 * Dual GPT Runner with Arbitration
 *
 * A reusable pattern for running two GPT calls in parallel and resolving
 * disagreements through a third arbitration call.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { parseJsonResponse } from "./response-parser";
import type { AIContext, AIModelTier } from "@/lib/flow/types";

export interface DualGptResult<T> {
  result: T;
  reasoning: string;
  wasArbitrated: boolean;
}

export interface DualGptConfig<T> {
  taskName: string;
  prompt: string;
  messageContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  >;
  schema: z.ZodSchema<T>;
  ai: AIContext;
  model?: AIModelTier;
  compareResults: (r1: T, r2: T) => boolean;
}

// Arbitration result schema
const arbitrationSchema = z.object({
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string().optional(),
});

/**
 * Build arbitration prompt
 */
function buildArbitrationPrompt<T>(taskName: string, result1: T, result2: T): string {
  return `You are an arbitration AI.

### Task Description
${taskName}

### GPT 1 Result
${JSON.stringify(result1, null, 2)}

### GPT 2 Result
${JSON.stringify(result2, null, 2)}

### Your Task
Determine which result is more accurate based on the original input.
- Return choice: 1 to use GPT 1's result
- Return choice: 2 to use GPT 2's result
- Return choice: 0 if both are incorrect (mark as anomaly)

### Output (raw JSON only)
{"choice": 1 | 2 | 0, "reason": "..."}`;
}

/**
 * Run dual GPT calls in parallel
 */
async function runDualGptCalls<T>(
  ai: AIContext,
  prompt: string,
  messageContent: DualGptConfig<T>["messageContent"],
  model: AIModelTier,
  schema: z.ZodSchema<T>
): Promise<[T, T]> {
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

  const result1 = parseJsonResponse(response1.content, schema);
  const result2 = parseJsonResponse(response2.content, schema);

  return [result1, result2];
}

/**
 * Run arbitration when GPT results differ
 */
async function runArbitration<T>(
  ai: AIContext,
  taskName: string,
  messageContent: DualGptConfig<T>["messageContent"],
  result1: T,
  result2: T
): Promise<{ result: T; reasoning: string }> {
  const arbitrationPrompt = buildArbitrationPrompt(taskName, result1, result2);

  const arbitrationResponse = await ai.generate({
    prompt: arbitrationPrompt,
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  const arbitrationResult = parseJsonResponse(arbitrationResponse.content, arbitrationSchema);

  if (arbitrationResult.choice === 0) {
    throw new Error(
      `ARBITRATION_FAILED: ${taskName} - ${arbitrationResult.reason ?? "Both results invalid"}`
    );
  }

  const chosenResult = arbitrationResult.choice === 1 ? result1 : result2;
  const reasoning =
    (chosenResult as { reasoning?: string }).reasoning ?? arbitrationResult.reason ?? "";

  return { result: chosenResult, reasoning };
}

/**
 * Run dual GPT calls with arbitration for disagreements
 *
 * This pattern runs two independent GPT calls and compares their results.
 * If results match (according to compareResults function), returns the result.
 * If results differ, a third "arbitrator" GPT decides which is correct.
 */
export async function runDualGptWithArbitration<T>({
  taskName,
  prompt,
  messageContent,
  schema,
  ai,
  model = "text",
  compareResults,
}: DualGptConfig<T>): Promise<DualGptResult<T>> {
  // Run dual GPT calls in parallel
  const [result1, result2] = await runDualGptCalls(ai, prompt, messageContent, model, schema);

  // If results match, return GPT1's result
  if (compareResults(result1, result2)) {
    return {
      result: result1,
      reasoning: (result1 as { reasoning?: string }).reasoning ?? "",
      wasArbitrated: false,
    };
  }

  // Results don't match - run arbitration
  logger.info({ taskName }, "GPT results differ, running arbitration");

  const { result, reasoning } = await runArbitration(
    ai,
    taskName,
    messageContent,
    result1,
    result2
  );

  return {
    result,
    reasoning,
    wasArbitrated: true,
  };
}
