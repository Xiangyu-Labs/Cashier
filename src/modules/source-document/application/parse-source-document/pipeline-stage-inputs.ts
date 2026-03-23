import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { ValidationInput } from "./stage1-5-validator";
import type { Stage1Input } from "./stage1-executor";
import type { Stage2Input } from "./stage2-executor";
import type { Stage1Results, ValidationSummary } from "./types";

export function buildStage1Input(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined
): Stage1Input {
  return {
    categories: input.categories.map((category) => ({
      name: category.name,
      description: category.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}

export function buildStage1ValidationInput(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  stage1Results: Stage1Results
): ValidationInput {
  return {
    stage1Results,
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  };
}

export function buildStage2Input(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  validationSummary: ValidationSummary
): Stage2Input {
  return {
    validationSummary,
    originalCategories: input.categories.map((category) => ({
      name: category.name,
      description: category.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  };
}
