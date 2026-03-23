import { parseJsonResponse } from "@/lib/ai/response-parser";
import { runDualGptWithArbitration } from "@/lib/ai/dual-gpt-runner";
import type { AIContext } from "@/lib/flow/types";
import type {
  CategoryRecognitionOutput,
  CompletenessCheckOutput,
  CurrencyRecognitionOutput,
  TitleExtractionOutput,
  UserRequirementsOutput,
  ValidityCheckOutput,
} from "./types";
import {
  categorySchema,
  completenessSchema,
  currencySchema,
  rulesSchema,
  titleSchema,
  validitySchema,
} from "./schemas";
import {
  buildCategoryRecognitionPrompt,
  buildCompletenessCheckPrompt,
  buildCurrencyRecognitionPrompt,
  buildTitleExtractionPrompt,
  buildUserRequirementsPrompt,
  buildValidityCheckPrompt,
} from "./stage1-prompts";
import type { MessageContentPart } from "./message-content";

export function haveSameStringMembers(left: string[], right: string[]): boolean {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

export async function runValidityTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  ai: AIContext
): Promise<ValidityCheckOutput> {
  const result = await runDualGptWithArbitration<ValidityCheckOutput>({
    taskName: "Validity Check - Determine if input contains valid financial data",
    prompt: buildValidityCheckPrompt(aiLanguage),
    messageContent,
    schema: validitySchema,
    ai,
    model: "text",
    compareResults: (r1, r2) => r1.is_valid === r2.is_valid,
  });

  return result.result;
}

export async function runCompletenessTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  ai: AIContext
): Promise<CompletenessCheckOutput> {
  const response = await ai.generate({
    prompt: buildCompletenessCheckPrompt(aiLanguage),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });
  const parsed = parseJsonResponse(response.content, completenessSchema);

  return {
    is_complete: parsed.is_complete,
    ...(parsed.issue != null && parsed.issue !== "" ? { issue: parsed.issue } : {}),
  };
}

export async function runCurrencyTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  preferredCurrencies: string[] | undefined,
  ai: AIContext
): Promise<CurrencyRecognitionOutput> {
  const result = await runDualGptWithArbitration<CurrencyRecognitionOutput>({
    taskName: "Currency Recognition - Identify currencies in the document",
    prompt: buildCurrencyRecognitionPrompt(aiLanguage, preferredCurrencies),
    messageContent,
    schema: currencySchema,
    ai,
    model: "text",
    compareResults: (r1, r2) => haveSameStringMembers(r1.currencies, r2.currencies),
  });

  return result.result;
}

export async function runCategoryTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  categories: { name: string; description: string | null }[],
  ai: AIContext
): Promise<CategoryRecognitionOutput> {
  const result = await runDualGptWithArbitration<CategoryRecognitionOutput>({
    taskName: "Category Recognition - Identify expense categories",
    prompt: buildCategoryRecognitionPrompt(aiLanguage, categories),
    messageContent,
    schema: categorySchema,
    ai,
    model: "text",
    compareResults: (r1, r2) => haveSameStringMembers(r1.categories, r2.categories),
  });

  return result.result;
}

export async function runTitleTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  ai: AIContext
): Promise<TitleExtractionOutput> {
  const response = await ai.generate({
    prompt: buildTitleExtractionPrompt(aiLanguage),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  return parseJsonResponse(response.content, titleSchema);
}

export async function runUserRequirementsTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  aiCustomPrompt: string | undefined,
  ai: AIContext
): Promise<UserRequirementsOutput | undefined> {
  if (aiCustomPrompt == null || aiCustomPrompt.trim() === "") {
    return undefined;
  }

  const response = await ai.generate({
    prompt: buildUserRequirementsPrompt(aiLanguage, aiCustomPrompt),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  return parseJsonResponse(response.content, rulesSchema);
}
