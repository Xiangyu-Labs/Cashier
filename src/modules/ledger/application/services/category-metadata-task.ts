import { db } from "@/lib/db";
import { submitFlowTask } from "@/lib/flow";
import { logger } from "@/lib/logger";
import { entryCategories } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";
import { TASK_TYPE_GENERATE_CATEGORY_METADATA } from "@/modules/ledger/application/tasks/generate-category-metadata";

interface SubmitCategoryMetadataTaskInput {
  ledgerId: string;
  categoryId: string;
  categoryName: string;
  icon?: string;
  description?: string | null;
}

function shouldGenerateCategoryMetadata(input: SubmitCategoryMetadataTaskInput): boolean {
  return (
    input.icon == null || input.icon === "" || input.description == null || input.description === ""
  );
}

export async function submitCategoryMetadataTaskIfNeeded(
  input: SubmitCategoryMetadataTaskInput
): Promise<void> {
  if (!shouldGenerateCategoryMetadata(input)) {
    return;
  }

  try {
    const existingCategories = await db.query.entryCategories.findMany({
      where: and(eq(entryCategories.ledgerId, input.ledgerId), isNull(entryCategories.deletedAt)),
      columns: { name: true, description: true, icon: true },
    });

    await submitFlowTask(
      TASK_TYPE_GENERATE_CATEGORY_METADATA,
      {
        ledgerId: input.ledgerId,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        existingCategories,
        aiLanguage: "zh-CN",
      },
      {
        title: `Generate metadata for category: ${input.categoryName}`,
        scopeId: input.ledgerId,
        entityType: "category",
        entityId: input.categoryId,
      }
    );
  } catch (err) {
    logger.error({ err, ledgerId: input.ledgerId }, "Failed to submit category metadata task");
  }
}
