import { z } from "zod";
import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext } from "@/lib/flow/types";
import type { MessageContentPart } from "./message-content";
import type { ParsedEntry } from "./types";

const arbitrationSchema = z.object({
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string().optional(),
});

export type Stage2ArbitrationCandidate = {
  ledger_entries: ParsedEntry[];
  reasoning: string;
};

export function buildStage2ArbitrationPrompt(
  result1: Stage2ArbitrationCandidate,
  result2: Stage2ArbitrationCandidate
): string {
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

export async function arbitrateStage2Results(
  ai: AIContext,
  messageContent: MessageContentPart[],
  result1: Stage2ArbitrationCandidate,
  result2: Stage2ArbitrationCandidate
):
  Promise<
    | { kind: "chosen"; result: Stage2ArbitrationCandidate }
    | { kind: "anomaly"; reason: string }
  > {
  const response = await ai.generate({
    prompt: buildStage2ArbitrationPrompt(result1, result2),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  const arbitrationResult = parseJsonResponse(response.content, arbitrationSchema);
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
