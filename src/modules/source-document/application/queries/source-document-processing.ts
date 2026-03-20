import { db } from "@/lib/db";
import type {
  ProcessingStatsDto,
  ProcessingTaskDto,
} from "@/modules/source-document/contracts";
import type { ProcessingTasksQueryInput } from "@/modules/source-document/contract-schemas";
import { taskRuns, type TaskRun } from "@/persistence";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

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

function serializeProcessingTask(task: TaskRun): ProcessingTaskDto {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    startedAt: task.startedAt ? task.startedAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
  };
}

export async function listProcessingTasks(
  ledgerId: string,
  params: ProcessingTasksQueryInput
): Promise<ProcessingTaskDto[]> {
  const { activeOnly, limit = 10 } = params;
  const conditions = [isNull(taskRuns.deletedAt), eq(taskRuns.scopeId, ledgerId)];

  if (activeOnly) {
    conditions.push(inArray(taskRuns.status, ["running", "pending"]));
  }

  const filteredTasks = await db.query.taskRuns.findMany({
    where: and(...conditions),
    orderBy: [desc(taskRuns.createdAt)],
    limit,
  });

  return filteredTasks.map(serializeProcessingTask);
}

export async function getProcessingStats(ledgerId: string): Promise<ProcessingStatsDto> {
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
    if (task.tokenUsage == null) {
      continue;
    }

    const parsed = TokenUsageSchema.safeParse(task.tokenUsage);
    if (!parsed.success) {
      continue;
    }

    const total = parsed.data.total ?? { input: 0, output: 0 };
    totalInputTokens += total.input ?? 0;
    totalOutputTokens += total.output ?? 0;
    totalTokens += (total.input ?? 0) + (total.output ?? 0);
  }

  return {
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    taskCount,
    averageTokensPerTask: taskCount > 0 ? Math.round(totalTokens / taskCount) : 0,
  };
}
