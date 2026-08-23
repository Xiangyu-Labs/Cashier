import type { CategoryPort, SettingsPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import type { CategoryMetadataGeneratorPort } from "../ports";

export interface CategoryMetadataResult {
  categoryId: string;
  icon: string;
  description: string;
  status: "updated" | "already_complete" | "stale";
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
  const category = await dependencies.categories.get(input.ledgerId, input.categoryId);
  if (category == null) throw new NotFoundError("Category");
  const categoryComplete =
    category.icon != null &&
    category.icon !== "" &&
    category.description != null &&
    category.description !== "";
  if (categoryComplete) {
    return {
      categoryId: input.categoryId,
      icon: category.icon!,
      description: category.description!,
      status: "already_complete",
      wroteIcon: false,
      wroteDescription: false,
    };
  }
  const [settings, existingCategories] = await Promise.all([
    dependencies.settings.get(input.ledgerId),
    dependencies.categories.list(input.ledgerId),
  ]);
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
    { ...metadata, expectedName: category.name }
  );
  if (written.status === "not_found") throw new NotFoundError("Category");

  return {
    categoryId: input.categoryId,
    icon: metadata.icon,
    description: metadata.description,
    status: written.status,
    wroteIcon: written.wroteIcon,
    wroteDescription: written.wroteDescription,
  };
}
