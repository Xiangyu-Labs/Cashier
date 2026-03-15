"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories, ledgerEntries, serviceCredentials, users } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, inArray } from "drizzle-orm";

export const deleteLedgerAction = withAuth(async (userId: string, id: string): Promise<void> => {
    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== userId) {
        throw new Error("Ledger not found or access denied");
    }

    // Check if this is the user's default ledger
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (user?.defaultLedgerId === id) {
        throw new Error("Cannot delete the primary ledger. Please set another ledger as primary first.");
    }

    const { sourceDocuments, taskRuns } = await import("@/lib/db/schema");
    const { flowEngine } = await import("@/lib/flow");
    const now = new Date();

    // Find and cancel all task_runs for this ledger before transaction
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.scopeId, id)
        ),
    });

    // Cancel any running/pending tasks
    for (const task of relatedTaskRuns) {
        if (task.status === 'pending' || task.status === 'running') {
            await flowEngine.cancel(task.id);
        }
    }

    const taskIdsToDelete = relatedTaskRuns.map(t => t.id);

    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
        // 1. Soft delete all associated ledger entries
        tx.update(ledgerEntries)
            .set({ deletedAt: now })
            .where(and(eq(ledgerEntries.ledgerId, id), isNull(ledgerEntries.deletedAt)))
            .run();

        // 2. Soft delete all associated entry categories
        tx.update(entryCategories)
            .set({ deletedAt: now })
            .where(and(eq(entryCategories.ledgerId, id), isNull(entryCategories.deletedAt)))
            .run();

        // 3. Soft delete all associated source documents
        tx.update(sourceDocuments)
            .set({ deletedAt: now })
            .where(and(eq(sourceDocuments.ledgerId, id), isNull(sourceDocuments.deletedAt)))
            .run();

        // 4. Soft delete all associated task_runs
        if (taskIdsToDelete.length > 0) {
            tx.update(taskRuns)
                .set({ deletedAt: now })
                .where(inArray(taskRuns.id, taskIdsToDelete))
                .run();
        }

        // 5. Soft delete all associated service credentials
        tx.update(serviceCredentials)
            .set({ deletedAt: now })
            .where(and(eq(serviceCredentials.ledgerId, id), isNull(serviceCredentials.deletedAt)))
            .run();

        // 6. Finally soft delete the ledger itself
        tx.update(ledgers)
            .set({ deletedAt: now })
            .where(eq(ledgers.id, id))
            .run();
    });
});
