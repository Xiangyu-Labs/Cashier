"use server";

import { db } from "@/lib/db";
import { entryCategories, taskRuns, ledgerEntries } from "@/persistence";
import { z } from "zod";
import { eq, asc, desc, and, isNull, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { type SerializedEntryCategory, serializeEntryCategory } from "@/lib/serialization";
import { withLedgerAccess } from "@/lib/auth-actions";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_GENERATE_CATEGORY_METADATA } from "@/modules/ledger/application/tasks/generate-category-metadata";
import { forLedger } from "@/lib/db/scoped-query";

const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

const updateCategorySchema = createCategorySchema.partial().extend({
  sortOrder: z.number().optional(),
});

export const createEntryCategoryAction = withLedgerAccess(
  async (
    ledgerId: string,
    data: z.infer<typeof createCategorySchema>
  ): Promise<SerializedEntryCategory> => {
    const validated = createCategorySchema.parse(data);

    // Get current max sortOrder to append new category at the end
    const existingCategories = await db.query.entryCategories.findMany({
      where: and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
      columns: { sortOrder: true },
      orderBy: desc(entryCategories.sortOrder),
      limit: 1,
    });

    const maxSortOrder =
      existingCategories.length > 0 ? (existingCategories[0].sortOrder ?? -1) : -1;
    const newSortOrder = validated.sortOrder ?? maxSortOrder + 1;

    const [category] = await db
      .insert(entryCategories)
      .values({
        ...validated,
        ledgerId: ledgerId,
        sortOrder: newSortOrder,
      })
      .returning();

    // Trigger AI to generate metadata (async)
    // Only if icon or description is missing
    if (
      validated.icon == null ||
      validated.icon === "" ||
      validated.description == null ||
      validated.description === ""
    ) {
      try {
        // Fetch existing categories for context
        const existing = await db.query.entryCategories.findMany({
          where: and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
          columns: { name: true, description: true, icon: true },
        });

        await flowEngine.submit(
          TASK_TYPE_GENERATE_CATEGORY_METADATA,
          {
            ledgerId: ledgerId,
            categoryId: category.id,
            categoryName: category.name,
            existingCategories: existing,
            aiLanguage: "zh-CN",
          },
          {
            title: `Generate metadata for category: ${validated.name}`,
            scopeId: ledgerId,
            entityType: "category",
            entityId: category.id,
          }
        );
      } catch (err) {
        logger.error({ err, ledgerId }, "Failed to submit category metadata task");
        // Don't fail the request, just log
      }
    }

    return serializeEntryCategory(category);
  }
);

export const updateEntryCategoryAction = withLedgerAccess(
  async (
    ledgerId: string,
    categoryId: string,
    data: z.infer<typeof updateCategorySchema>
  ): Promise<void> => {
    const validated = updateCategorySchema.parse(data);
    const q = forLedger(entryCategories, ledgerId);

    await db.update(entryCategories).set(validated).where(q.whereId(categoryId));
  }
);

export const deleteEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, categoryId: string): Promise<void> => {
    // Cancel any pending/running background tasks for this category
    const pendingTasks = await db
      .select({ id: taskRuns.id })
      .from(taskRuns)
      .where(
        and(
          eq(taskRuns.type, "generate_category_metadata"),
          inArray(taskRuns.status, ["pending", "running"]),
          isNull(taskRuns.deletedAt),
          eq(taskRuns.entityType, "category"),
          eq(taskRuns.entityId, categoryId)
        )
      );

    for (const task of pendingTasks) {
      await flowEngine.cancel(task.id);
    }

    const q = forLedger(entryCategories, ledgerId);

    // better-sqlite3 transactions are synchronous, so we use a sync callback
    db.transaction((tx) => {
      // First, set categoryId to null for all entries in this category
      // This makes them "uncategorized" instead of orphaned
      tx.update(ledgerEntries)
        .set({ categoryId: null })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.categoryId, categoryId),
            isNull(ledgerEntries.deletedAt)
          )
        )
        .run();

      // Then soft-delete the category
      tx.update(entryCategories).set(q.softDelete).where(q.whereId(categoryId)).run();
    });
  }
);

export const reorderEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, categoryIds: string[]): Promise<void> => {
    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
      for (let i = 0; i < categoryIds.length; i++) {
        // Ensure we only update categories belonging to this ledger
        tx.update(entryCategories)
          .set({ sortOrder: i })
          .where(
            and(eq(entryCategories.id, categoryIds[i]), eq(entryCategories.ledgerId, ledgerId))
          )
          .run();
      }
    });
  }
);

export async function listEntryCategories(ledgerId: string) {
  const q = forLedger(entryCategories, ledgerId);

  // Note: Use db.query for findMany to match return type structure if needed, or normal select
  const categories = await db.query.entryCategories.findMany({
    where: q.whereActive,
    orderBy: asc(entryCategories.sortOrder),
  });

  // Get entry counts for each category
  const entryCounts = await db
    .select({
      categoryId: ledgerEntries.categoryId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)))
    .groupBy(ledgerEntries.categoryId);

  // Create a map for quick lookup
  const countMap = new Map(entryCounts.map((e) => [e.categoryId, e.count]));

  const categoriesWithCount = categories.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    // deletedAt is excluded by whereActive but type definition has it
    deletedAt: c.deletedAt != null ? c.deletedAt.toISOString() : null,
    entryCount: countMap.get(c.id) ?? 0,
  }));

  return categoriesWithCount;
}

export const getEntryCategoriesAction = withLedgerAccess(listEntryCategories);

/**
 * Get count of uncategorized entries (entries without a category)
 * Separated from getEntryCategoriesAction for cleaner cache management
 */
export const getUncategorizedCountAction = withLedgerAccess(
  async (ledgerId: string): Promise<number> => {
    const result = await db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          isNull(ledgerEntries.deletedAt),
          isNull(ledgerEntries.categoryId)
        )
      );

    return result[0]?.count ?? 0;
  }
);
