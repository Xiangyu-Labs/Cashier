"use server";

import { db } from "@/lib/db";
import { taskRuns, type TaskRun } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";

// Helper to extract ledgerId from task input JSON
function getLedgerIdFromInput(input: unknown): string | null {
    if (typeof input === "object" && input !== null && "ledgerId" in input) {
        return (input as { ledgerId: string }).ledgerId;
    }
    return null;
}

export async function getProcessingTasksAction(ledgerId: string, params: {
    activeOnly?: boolean;
    limit?: number;
}) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const { activeOnly, limit = 10 } = params;

    // Fetch all active tasks (not soft-deleted)
    const conditions = [isNull(taskRuns.deletedAt)];

    if (activeOnly) {
        conditions.push(inArray(taskRuns.status, ["running", "queued"]));
    }

    const allTasks = await db.query.taskRuns.findMany({
        where: and(...conditions),
        orderBy: [desc(taskRuns.createdAt)],
    });

    // Filter by ledgerId from input JSON
    const filteredTasks = allTasks
        .filter(task => getLedgerIdFromInput(task.input) === ledgerId)
        .slice(0, limit);

    return filteredTasks.map((t: TaskRun) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null
    }));
}

export async function getProcessingStatsAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    // Fetch all completed, non-deleted tasks
    const allTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.status, 'completed')
        ),
    });

    // Filter by ledgerId from input JSON
    const tasks = allTasks.filter(task => getLedgerIdFromInput(task.input) === ledgerId);

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const taskCount = tasks.length;

    for (const task of tasks) {
        if (task.tokenUsage) {
            // tokenUsage is jsonb with per-model breakdown and 'total' key
            const u = task.tokenUsage as { total?: { input?: number; output?: number };[model: string]: { input?: number; output?: number } | undefined };
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
