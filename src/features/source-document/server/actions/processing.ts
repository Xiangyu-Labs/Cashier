"use server";

import { db } from "@/lib/db";
import { taskRuns, type TaskRun } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray } from "drizzle-orm";

import { forLedger } from "@/lib/db/scoped-query";

export async function getProcessingTasksAction(ledgerId: string, params: {
    activeOnly?: boolean;
    limit?: number;
}) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const { activeOnly, limit = 10 } = params;

    const q = forLedger(taskRuns, ledgerId);

    // Using forLedger active condition base
    const conditions = [q.whereActive];

    if (activeOnly) {
        conditions.push(inArray(taskRuns.status, ["running", "queued"]));
    }

    const tasks = await db.query.taskRuns.findMany({
        where: and(...conditions),
        orderBy: [desc(taskRuns.createdAt)],
        limit: limit,
    });


    return tasks.map((t: TaskRun) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null
    }));
}

export async function getProcessingStatsAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const q = forLedger(taskRuns, ledgerId);

    const tasks = await db.query.taskRuns.findMany({
        where: and(
            q.whereActive,
            eq(taskRuns.status, 'completed')
        ),
    });

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const taskCount = tasks.length;

    for (const task of tasks) {
        if (task.tokenUsage) {
            // tokenUsage is jsonb with per-model breakdown and 'total' key
            const u = task.tokenUsage as { total?: { input?: number; output?: number }; [model: string]: { input?: number; output?: number } | undefined };
            const total = u.total || { input: 0, output: 0 };
            totalInputTokens += total.input || 0;
            totalOutputTokens += total.output || 0;
            totalTokens += (total.input || 0) + (total.output || 0);
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
