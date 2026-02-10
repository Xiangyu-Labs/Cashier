"use server";

import { db } from "@/lib/db";
import { ledgerEntries, entryCategories, taskRuns } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_CATEGORIZE_ENTRY, type CategorizeEntryInput } from "../tasks/categorize-entry";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { formatDateTimeForApi } from "@/lib/date-utils";

export interface AutoCategorizeResult {
    success: boolean;
    submittedCount: number;
    skippedCount: number;
    error?: string;
}

/**
 * Submit auto-categorization tasks for all uncategorized entries in a ledger.
 * Implements duplicate prevention by checking for pending/running tasks.
 */
export async function submitAutoCategorizeAction(ledgerId: string): Promise<AutoCategorizeResult> {
    try {
        // Verify session and ledger access
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) {
            return { success: false, submittedCount: 0, skippedCount: 0, error: "Unauthorized" };
        }

        // 1. Get all uncategorized entries with their source documents
        const uncategorizedEntries = await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.ledgerId, ledgerId),
                isNull(ledgerEntries.categoryId),
                isNull(ledgerEntries.deletedAt)
            ),
            with: {
                sourceDocument: true,
            }
        });

        if (uncategorizedEntries.length === 0) {
            return { success: true, submittedCount: 0, skippedCount: 0 };
        }

        // 2. Get pending/running tasks of type categorize_entry
        const pendingTasks = await db.query.taskRuns.findMany({
            where: and(
                eq(taskRuns.type, TASK_TYPE_CATEGORIZE_ENTRY),
                inArray(taskRuns.status, ['pending', 'running'])
            ),
        });

        // 3. Extract entryIds from pending task inputs
        const pendingEntryIds = new Set<string>();
        for (const task of pendingTasks) {
            try {
                const input = task.input as CategorizeEntryInput;
                if (input?.entryId) {
                    pendingEntryIds.add(input.entryId);
                }
            } catch {
                // Skip malformed inputs
            }
        }

        // 4. Get categories for this ledger
        const categories = await db.query.entryCategories.findMany({
            where: and(
                eq(entryCategories.ledgerId, ledgerId),
                isNull(entryCategories.deletedAt)
            ),
            orderBy: (cats, { asc }) => [asc(cats.sortOrder)],
        });

        if (categories.length === 0) {
            return {
                success: false,
                submittedCount: 0,
                skippedCount: uncategorizedEntries.length,
                error: "No categories available"
            };
        }

        // Build indexed categories for AI
        const indexedCategories = categories.map((c, index) => ({
            id: c.id,
            index: index + 1,
            name: c.name,
            description: c.description,
        }));

        // 5. Filter entries without pending tasks and submit new tasks
        let submittedCount = 0;
        let skippedCount = 0;

        for (const entry of uncategorizedEntries) {
            if (pendingEntryIds.has(entry.id)) {
                skippedCount++;
                continue;
            }

            const taskInput: CategorizeEntryInput = {
                ledgerId,
                entryId: entry.id,
                itemName: entry.itemName,
                amount: entry.amount,
                currency: entry.currency ?? "CNY",
                description: entry.description,
                entryDate: entry.sourceDocument?.entryDate ?? formatDateTimeForApi(new Date()),
                sourceDocumentText: entry.sourceDocument?.text || undefined,
                sourceDocumentImageUrls: entry.sourceDocument?.imageUrls || undefined,
                categories: indexedCategories,
                aiLanguage: "zh-CN",
            };

            await flowEngine.submit(TASK_TYPE_CATEGORIZE_ENTRY, taskInput, {
                title: `Categorize: ${entry.itemName}`,
                scopeId: ledgerId,
                entityType: 'entry',
                entityId: entry.id,
            });

            submittedCount++;
        }

        logger.info({
            ledgerId,
            submittedCount,
            skippedCount,
            totalUncategorized: uncategorizedEntries.length,
        }, "Auto-categorize tasks submitted");

        return { success: true, submittedCount, skippedCount };

    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to submit auto-categorize tasks");
        return {
            success: false,
            submittedCount: 0,
            skippedCount: 0,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
