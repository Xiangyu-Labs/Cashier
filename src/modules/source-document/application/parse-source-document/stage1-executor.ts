import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext } from "@/lib/flow/types";
import { buildMessageContent } from "./message-content";
import type { DocumentUnderstanding } from "./types";
import { validitySchema } from "./schemas";
import { buildValidityCheckPrompt } from "./stage1-prompts";

export interface Stage1Input {
  text?: string;
  imageUrls?: string[];
  documentUnderstanding?: DocumentUnderstanding;
  aiLanguage?: string;
}

export type Stage1Output =
  | { isValid: false; reasoning: string }
  | { isValid: true; reasoning: string };

export async function executeStage1(
  input: Stage1Input,
  ai: AIContext
): Promise<Stage1Output> {
  const messageContent = buildMessageContent(
    input.text,
    input.imageUrls,
    undefined,
    input.documentUnderstanding
  );

  const response = await ai.generate({
    prompt: buildValidityCheckPrompt(input.aiLanguage),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  const result = parseJsonResponse(response.content, validitySchema);

  return {
    isValid: result.is_valid,
    reasoning: result.reasoning,
  };
}
