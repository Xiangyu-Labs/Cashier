"use server";

import { db } from "@/lib/db";
import { ledgerEntries, entryCategories, taskRuns, ledgers } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_CATEGORIZE_ENTRY, type CategorizeEntryInput } from "../tasks/categorize-entry";
import { logger } from "@/lib/logger";
import { withLedgerAccess } from "@/lib/auth-actions";
import { formatDateTimeForApi } from "@/lib/date-utils";

export interface CategorizeResult {
    submittedCount: number;
    skippedCount: number;
}

/**
 * Get pending categorize task entry IDs for duplicate prevention
 */
async function getPendingCategorizeTaskEntryIds(): Promise<Set<string>> {
    const pendingTasks = await db.query.taskRuns.findMany({
        where: and(
            eq(taskRuns.type, TASK_TYPE_CATEGORIZE_ENTRY),
            inArray(taskRuns.status, ['pending', 'running'])
        ),
    });

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

    return pendingEntryIds;
}

/**
 * Build indexed categories for AI categorization
 */
async function buildIndexedCategories(ledgerId: string): Promise<
    Array<{ id: string; index: number; name: string; description: string | null }>
> {
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

    return categories.map((c, index) => ({
        id: c.id,
        index: index + 1,
        name: c.name,
        description: c.description,
    }));
}

/**
 * Get AI language setting for a ledger
 */
async function getLedgerAILanguage(ledgerId: string): Promise<string> {
    const ledger = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });
    return ledger?.metadata?.settings?.aiLanguage || "zh-CN";
}

/**
 * Submit a single categorize task for an entry
 */
async function submitSingleCategorizeTask(
    entry: {
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
    },
    ledgerId: string,
    categories: Array<{ id: string; index: number; name: string; description: string | null }>,
    aiLanguage: string
): Promise<void> {
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
        categories,
        aiLanguage,
    };

    await flowEngine.submit(TASK_TYPE_CATEGORIZE_ENTRY, taskInput, {
        title: `Categorize: ${entry.itemName}`,
        scopeId: ledgerId,
        entityType: 'entry',
        entityId: entry.id,
    });
}

/**
 * Check if entry should be skipped for categorization
 */
function shouldSkipEntry(
    entry: {
        id: string;
        sourceDocument?: { type?: string | null } | null;
    },
    pendingEntryIds: Set<string>
): boolean {
    // Skip quick entries (manual type source documents) - user's explicit choice
    if (entry.sourceDocument?.type === 'manual') {
        return true;
    }
    // Skip entries with pending tasks (duplicate prevention)
    if (pendingEntryIds.has(entry.id)) {
        return true;
    }
    return false;
}

/**
 * Shared internal function to submit categorization tasks for a set of entries.
 * Implements duplicate prevention by checking for pending/running tasks.
 */
async function submitCategorizeTasksForEntries(
    ledgerId: string,
    entries: Array<{
        id: string;
        categoryId: string | null;
        itemName: string;
        amount: string;
        currency: string | null;
        description: string | null;
        sourceDocument?: {
            type?: string | null;
            entryDate: string | null;
            text: string | null;
            imageUrls: string[] | null;
        } | null;
    }>
): Promise<CategorizeResult> {
    if (entries.length === 0) {
        return { submittedCount: 0, skippedCount: 0 };
    }

    const [pendingEntryIds, indexedCategories, aiLanguage] = await Promise.all([
        getPendingCategorizeTaskEntryIds(),
        buildIndexedCategories(ledgerId),
        getLedgerAILanguage(ledgerId),
    ]);

    let submittedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
        if (shouldSkipEntry(entry, pendingEntryIds)) {
            skippedCount++;
            continue;
        }

        await submitSingleCategorizeTask(entry, ledgerId, indexedCategories, aiLanguage);
        submittedCount++;
    }

    return { submittedCount, skippedCount };
}

/**
 * Submit auto-categorization tasks for all uncategorized entries in a ledger.
 */
export const submitAutoCategorizeAction = withLedgerAccess(async (ledgerId: string): Promise<CategorizeResult> => {
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
});

/**
 * Submit categorization tasks for specified entries.
 */
export const submitBatchCategorizeAction = withLedgerAccess(async (
    ledgerId: string,
    entryIds: string[]
): Promise<CategorizeResult> => {
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
});
