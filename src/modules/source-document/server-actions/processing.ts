"use server";

import { db } from "@/lib/db";
import { taskRuns, type TaskRun } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

// Zod schema for tokenUsage validation (replaces type assertion)
const TokenUsageSchema = z
  .object({
    total: z
      .object({
        input: z.number().optional(),
        output: z.number().optional(),
      })
      .optional(),
  })
  .catchall(
    z
      .object({
        input: z.number().optional(),
        output: z.number().optional(),
      })
      .optional()
  );

export const getProcessingTasksAction = withLedgerAccess(
  async (
    ledgerId: string,
    params: {
      activeOnly?: boolean;
      limit?: number;
    }
  ) => {
    const { activeOnly, limit = 10 } = params;

    // Fetch tasks for this ledger using scopeId column
    const conditions = [isNull(taskRuns.deletedAt), eq(taskRuns.scopeId, ledgerId)];

    if (activeOnly) {
      conditions.push(inArray(taskRuns.status, ["running", "pending"]));
    }

    const filteredTasks = await db.query.taskRuns.findMany({
      where: and(...conditions),
      orderBy: [desc(taskRuns.createdAt)],
      limit,
    });

    return filteredTasks.map((t: TaskRun) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    }));
  }
);

export const getProcessingStatsAction = withLedgerAccess(async (ledgerId: string) => {
  // Fetch completed tasks for this ledger using scopeId column
  const tasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.status, "completed"),
      eq(taskRuns.scopeId, ledgerId)
    ),
  });

  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const taskCount = tasks.length;

  for (const task of tasks) {
    if (task.tokenUsage) {
      // Validate tokenUsage with Zod schema (replaces type assertion)
      const parsed = TokenUsageSchema.safeParse(task.tokenUsage);
      if (parsed.success) {
        const u = parsed.data;
        const total = u.total ?? { input: 0, output: 0 };
        totalInputTokens += total.input ?? 0;
        totalOutputTokens += total.output ?? 0;
        totalTokens += (total.input ?? 0) + (total.output ?? 0);
      }
    }
  }

  const averageTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;

  return {
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    taskCount,
    averageTokensPerTask,
  };
});
