import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { Stage0Input } from "./stage0-vision";
import type { Stage1Input } from "./stage1-executor";
import type { Stage2Input } from "./stage2-executor";
import type { DocumentUnderstanding } from "./types";

export function buildStage0Input(input: ParseSourceDocumentInput): Stage0Input {
  return {
    originalCategories: input.categories.map((c) => ({
      name: c.name,
      description: c.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}

export function buildStage1Input(
  input: ParseSourceDocumentInput,
  documentUnderstanding: DocumentUnderstanding | undefined
): Stage1Input {
  return {
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(documentUnderstanding !== undefined ? { documentUnderstanding } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  };
}

export function buildStage2Input(
  input: ParseSourceDocumentInput,
  documentUnderstanding: DocumentUnderstanding | undefined
): Stage2Input {
  return {
    originalCategories: input.categories.map((category) => ({
      name: category.name,
      description: category.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(documentUnderstanding !== undefined ? { documentUnderstanding } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}
