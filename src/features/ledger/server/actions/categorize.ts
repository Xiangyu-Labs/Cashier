"use server";

import { db } from "@/lib/db";
import { ledgerEntries, entryCategories, taskRuns, ledgers } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_CATEGORIZE_ENTRY, type CategorizeEntryInput } from "../tasks/categorize-entry";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { formatDateTimeForApi } from "@/lib/date-utils";

export interface CategorizeResult {
    submittedCount: number;
    skippedCount: number;
}

/**
 * Shared internal function to submit categorization tasks for a set of entries.
 * Implements duplicate prevention by checking for pending/running tasks.
 */
async function submitCategorizeTasksForEntries(
    ledgerId: string,
    entries: Array<{
        id: string;
        itemName: string;
        amount: string;
        currency: string | null;
        description: string | null;
        sourceDocument?: {
            entryDate: string | null;
            text: string | null;
            imageUrls: string[] | null;
        } | null;
    }>
): Promise<CategorizeResult> {
    if (entries.length === 0) {
        return { submittedCount: 0, skippedCount: 0 };
    }

    // 1. Get pending/running tasks of type categorize_entry
    const pendingTasks = await db.query.taskRuns.findMany({
        where: and(
            eq(taskRuns.type, TASK_TYPE_CATEGORIZE_ENTRY),
            inArray(taskRuns.status, ['pending', 'running'])
        ),
    });

    // 2. Extract entryIds from pending task inputs
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

    // 3. Get categories for this ledger
    const categories = await db.query.entryCategories.findMany({
        where: and(
            eq(entryCategories.ledgerId, ledgerId),
            isNull(entryCategories.deletedAt)
        ),
        orderBy: (cats, { asc }) => [asc(cats.sortOrder)],
    });

    if (categories.length === 0) {
        throw new Error("No categories available");
    }

    // 4. Get ledger settings for AI language (BUG FIX: was hardcoded in auto-categorize)
    const ledger = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });
    const aiLanguage = ledger?.metadata?.settings?.aiLanguage || "zh-CN";

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

    for (const entry of entries) {
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
            aiLanguage,
        };

        await flowEngine.submit(TASK_TYPE_CATEGORIZE_ENTRY, taskInput, {
            title: `Categorize: ${entry.itemName}`,
            scopeId: ledgerId,
            entityType: 'entry',
            entityId: entry.id,
        });

        submittedCount++;
    }

    return { submittedCount, skippedCount };
}

/**
 * Submit auto-categorization tasks for all uncategorized entries in a ledger.
 */
export async function submitAutoCategorizeAction(ledgerId: string): Promise<CategorizeResult> {
    // Verify session and ledger access
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    // Get all uncategorized entries with their source documents
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

    const result = await submitCategorizeTasksForEntries(ledgerId, uncategorizedEntries);

    logger.info({
        ledgerId,
        submittedCount: result.submittedCount,
        skippedCount: result.skippedCount,
        totalUncategorized: uncategorizedEntries.length,
    }, "Auto-categorize tasks submitted");

    return result;
}

/**
 * Submit categorization tasks for specified entries.
 */
export async function submitBatchCategorizeAction(
    ledgerId: string,
    entryIds: string[]
): Promise<CategorizeResult> {
    // Verify session and ledger access
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    if (entryIds.length === 0) {
        return { submittedCount: 0, skippedCount: 0 };
    }

    // Get selected entries with their source documents
    const selectedEntries = await db.query.ledgerEntries.findMany({
        where: and(
            eq(ledgerEntries.ledgerId, ledgerId),
            inArray(ledgerEntries.id, entryIds),
            isNull(ledgerEntries.deletedAt)
        ),
        with: {
            sourceDocument: true,
        }
    });

    const result = await submitCategorizeTasksForEntries(ledgerId, selectedEntries);

    logger.info({
        ledgerId,
        submittedCount: result.submittedCount,
        skippedCount: result.skippedCount,
        totalSelected: selectedEntries.length,
    }, "Batch categorize tasks submitted");

    return result;
}
