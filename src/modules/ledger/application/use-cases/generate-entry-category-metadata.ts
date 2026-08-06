import type { CategoryPort, SettingsPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import type { CategoryMetadataGeneratorPort } from "../ports";

export interface CategoryMetadataResult {
  categoryId: string;
  icon: string;
  description: string;
  wroteIcon: boolean;
  wroteDescription: boolean;
}

export async function generateEntryCategoryMetadata(
  input: {
    ledgerId: string;
    categoryId: string;
  },
  dependencies: {
    categories: CategoryPort;
    settings: SettingsPort;
    generator: CategoryMetadataGeneratorPort;
  }
): Promise<CategoryMetadataResult> {
  const [category, settings, existingCategories] = await Promise.all([
    dependencies.categories.get(input.ledgerId, input.categoryId),
    dependencies.settings.get(input.ledgerId),
    dependencies.categories.list(input.ledgerId),
  ]);
  if (category == null) throw new NotFoundError("Category");
  if (settings == null) throw new NotFoundError("Ledger");

  const metadata = await dependencies.generator.generate({
    categoryName: category.name,
    existingCategoryNames: existingCategories.map((existing) => existing.name),
    ...(settings.aiLanguage !== undefined ? { language: settings.aiLanguage } : {}),
    ...(settings.aiCustomPrompt !== undefined ? { customPrompt: settings.aiCustomPrompt } : {}),
  });
  const written = await dependencies.categories.updateMissingMetadata(
    input.ledgerId,
    input.categoryId,
    metadata
  );

  return {
    categoryId: input.categoryId,
    icon: metadata.icon,
    description: metadata.description,
    wroteIcon: written.wroteIcon,
    wroteDescription: written.wroteDescription,
  };
}
