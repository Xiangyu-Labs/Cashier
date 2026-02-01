"use server";

import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";

export async function getProcessingTasksAction(ledgerId: string, params: {
    activeOnly?: boolean;
    limit?: number;
}) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const { activeOnly, limit = 10 } = params;

    // Using scope.tasks if available or direct db.
    // Let's use db directly for now as per previous route, but strictly filtered by ledgerId.

    const conditions = [
        eq(taskRuns.ledgerId, ledgerId),
        isNull(taskRuns.deletedAt)
    ];
    if (activeOnly) {
        conditions.push(inArray(taskRuns.status, ["running", "queued"]));
    }

    const tasks = await db.query.taskRuns.findMany({
        where: and(...conditions),
        orderBy: [desc(taskRuns.createdAt)],
        limit: limit,
    });

    return tasks.map((t: any) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null
    }));
}

export async function getProcessingStatsAction(ledgerId: string) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const tasks = await db.query.taskRuns.findMany({
        where: and(
            eq(taskRuns.ledgerId, ledgerId),
            eq(taskRuns.status, 'completed'),
            isNull(taskRuns.deletedAt)
        ),
    });

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let taskCount = tasks.length;

    for (const task of tasks) {
        if (task.usage) {
            // usage is jsonb, cast it
            const u = task.usage as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
            totalTokens += u.totalTokens || 0;
            totalInputTokens += u.inputTokens || 0;
            totalOutputTokens += u.outputTokens || 0;
        }
    }

    const averageTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;

    return {
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        taskCount,
        averageTokensPerTask
    };
}
