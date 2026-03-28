import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { Stage0Input } from "./stage0-vision";

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

