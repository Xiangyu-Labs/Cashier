"use server";

import { db } from "@/lib/db";
import { taskRuns, sourceDocuments, type TaskRun, type SourceDocument } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { desc, eq, and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ForbiddenError, ValidationError } from "@/lib/errors";
import type {
  QueueItem,
  QueueItemStatus,
  TaskQueueResult,
  TaskQueueStats,
} from "./types";

export const cancelTaskAction = withLedgerAccess(
  async (ledgerId: string, taskId: string): Promise<void> => {
    const task = await db.query.taskRuns.findFirst({
      where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    if (task.scopeId !== ledgerId) {
      throw new ForbiddenError("Task does not belong to this ledger");
    }

    if (task.status !== "pending" && task.status !== "running") {
      throw new ValidationError(`Cannot cancel task with status '${task.status}'`);
    }

    await flowEngine.cancel(taskId);

    if (task.entityType === "source_document" && task.entityId != null && task.entityId !== "") {
      const q = forLedger(sourceDocuments, ledgerId);
      const doc = await db.query.sourceDocuments.findFirst({
        where: q.whereId(task.entityId),
      });
      if (doc && (doc.status === "processing" || doc.status === "queued")) {
        await db
          .update(sourceDocuments)
          .set({ deletedAt: new Date() })
          .where(q.whereId(task.entityId));
      }
    }
  }
);

export const batchCancelTasksAction = withLedgerAccess(
  async (ledgerId: string, taskIds: string[]): Promise<void> => {
    if (taskIds.length === 0) return;

    const tasks = await db.query.taskRuns.findMany({
      where: and(inArray(taskRuns.id, taskIds), isNull(taskRuns.deletedAt)),
    });

    const validTasks = tasks.filter(
      (task) =>
        task.scopeId === ledgerId && (task.status === "pending" || task.status === "running")
    );

    if (validTasks.length === 0) return;

    await Promise.all(validTasks.map((task) => flowEngine.cancel(task.id)));

    const sourceDocTasks = validTasks.filter(
      (task) =>
        task.entityType === "source_document" && task.entityId != null && task.entityId !== ""
    );

    if (sourceDocTasks.length > 0) {
      const q = forLedger(sourceDocuments, ledgerId);
      const entityIds = sourceDocTasks.map((t) => t.entityId!);

      const docs = await db.query.sourceDocuments.findMany({
        where: and(inArray(sourceDocuments.id, entityIds), q.whereActive),
      });

      const docsToDelete = docs.filter(
        (doc) => doc.status === "processing" || doc.status === "queued"
      );

      if (docsToDelete.length > 0) {
        await db
          .update(sourceDocuments)
          .set({ deletedAt: new Date() })
          .where(
            and(
              inArray(
                sourceDocuments.id,
                docsToDelete.map((d) => d.id)
              ),
              q.whereActive
            )
          );
      }
    }
  }
);

function getLedgerIdFromTask(task: typeof taskRuns.$inferSelect): string | null {
  return task.scopeId ?? null;
}

export const dismissTaskAction = withLedgerAccess(
  async (ledgerId: string, taskId: string): Promise<void> => {
    const task = await db.query.taskRuns.findFirst({
      where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    const taskLedgerId = getLedgerIdFromTask(task);
    if (taskLedgerId !== ledgerId) {
      throw new ForbiddenError("Task does not belong to this ledger");
    }

    await db.update(taskRuns).set({ deletedAt: new Date() }).where(eq(taskRuns.id, taskId));
  }
);

export const batchDismissTasksAction = withLedgerAccess(
  async (ledgerId: string, taskIds: string[]): Promise<void> => {
    if (taskIds.length === 0) return;

    const tasks = await db.query.taskRuns.findMany({
      where: and(inArray(taskRuns.id, taskIds), isNull(taskRuns.deletedAt)),
    });

    const validTaskIds = tasks
      .filter((task) => getLedgerIdFromTask(task) === ledgerId)
      .map((task) => task.id);

    if (validTaskIds.length === 0) return;

    await db
      .update(taskRuns)
      .set({ deletedAt: new Date() })
      .where(inArray(taskRuns.id, validTaskIds));
  }
);

const QueueItemStatusSchema = z.enum(["pending", "running", "completed", "failed", "anomaly"]);

function getSourceDocumentId(task: Pick<TaskRun, "entityType" | "entityId">): string | undefined {
  if (task.entityType !== "source_document" || task.entityId == null || task.entityId === "") {
    return undefined;
  }

  return task.entityId;
}

function taskRunToQueueItem(task: TaskRun, sourceDocTitle?: string | null): QueueItem {
  const sourceDocumentId = getSourceDocumentId(task);
  const parsedStatus = QueueItemStatusSchema.safeParse(task.status);
  const status: QueueItemStatus = parsedStatus.success ? parsedStatus.data : "failed";

  let title = task.title;
  if (
    status === "completed" &&
    task.type === "parse_source_document" &&
    typeof sourceDocTitle === "string"
  ) {
    title = `解析原始凭证：${sourceDocTitle}`;
  }

  return {
    id: task.id,
    kind: "task",
    status,
    title,
    subtitle: task.error ?? undefined,
    progress: task.progress ?? undefined,
    createdAt: task.createdAt.toISOString(),
    entityType: task.entityType ?? undefined,
    entityId: task.entityId ?? undefined,
    sourceDocumentId,
    taskId: task.id,
    taskType: task.type,
  };
}

function anomalyDocToQueueItem(doc: SourceDocument): QueueItem {
  return {
    id: doc.id,
    kind: "anomaly",
    status: "anomaly",
    title: doc.title ?? "Untitled Source Document",
    subtitle: doc.anomalyReason ?? undefined,
    createdAt: doc.createdAt.toISOString(),
    entityType: "source_document",
    entityId: doc.id,
    sourceDocumentId: doc.id,
    taskId: undefined,
    taskType: undefined,
  };
}

async function getTaskQueueForLedgerQuery(ledgerId: string): Promise<TaskQueueResult> {
  const activeTasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.status, ["pending", "running", "failed"]),
      eq(taskRuns.scopeId, ledgerId)
    ),
    orderBy: [desc(taskRuns.createdAt)],
  });

  const completedTasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.status, "completed"),
      eq(taskRuns.scopeId, ledgerId)
    ),
    orderBy: [desc(taskRuns.completedAt)],
    limit: 5,
  });

  const anomalyDocs = await db.query.sourceDocuments.findMany({
    where: and(
      eq(sourceDocuments.ledgerId, ledgerId),
      eq(sourceDocuments.status, "anomaly"),
      isNull(sourceDocuments.deletedAt)
    ),
    orderBy: [desc(sourceDocuments.createdAt)],
  });

  const items: QueueItem[] = [];

  const completedSourceDocIds = completedTasks
    .filter(
      (task) => task.type === "parse_source_document" && task.entityType === "source_document"
    )
    .map((task) => getSourceDocumentId(task))
    .filter((id): id is string => id != null && id !== "");

  const sourceDocTitles = new Map<string, string | null>();
  const anomalySourceDocIds = new Set<string>();
  if (completedSourceDocIds.length > 0) {
    const docs = await db.query.sourceDocuments.findMany({
      where: inArray(sourceDocuments.id, completedSourceDocIds),
      columns: { id: true, title: true, status: true },
    });
    for (const doc of docs) {
      sourceDocTitles.set(doc.id, doc.title);
      if (doc.status === "anomaly") {
        anomalySourceDocIds.add(doc.id);
      }
    }
  }

  for (const task of activeTasks) {
    items.push(taskRunToQueueItem(task));
  }

  for (const task of completedTasks) {
    const sourceDocId = getSourceDocumentId(task);
    if (sourceDocId != null && sourceDocId !== "" && anomalySourceDocIds.has(sourceDocId)) {
      continue;
    }
    const sourceDocTitle =
      typeof sourceDocId === "string" && sourceDocId.length > 0
        ? sourceDocTitles.get(sourceDocId)
        : undefined;
    items.push(taskRunToQueueItem(task, sourceDocTitle));
  }

  for (const doc of anomalyDocs) {
    items.push(anomalyDocToQueueItem(doc));
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const runningCount = items.filter((i) => i.status === "running").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const anomalyCount = items.filter((i) => i.status === "anomaly").length;

  const tokenStatsResult = await db
    .select({
      totalInput: sql<number>`COALESCE(SUM(CAST(json_extract(token_usage, '$.total.input') AS INTEGER)), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(CAST(json_extract(token_usage, '$.total.output') AS INTEGER)), 0)`,
      taskCount: sql<number>`COUNT(*)`,
    })
    .from(taskRuns)
    .where(
      and(
        isNull(taskRuns.deletedAt),
        eq(taskRuns.status, "completed"),
        eq(taskRuns.scopeId, ledgerId)
      )
    );

  const tokenStats = tokenStatsResult[0];
  const totalInputTokens = tokenStats?.totalInput ?? 0;
  const totalOutputTokens = tokenStats?.totalOutput ?? 0;
  const completedCount = tokenStats?.taskCount ?? 0;

  const totalTokens = totalInputTokens + totalOutputTokens;
  const avgTokensPerTask = completedCount > 0 ? Math.round(totalTokens / completedCount) : 0;

  const stats: TaskQueueStats = {
    pendingCount,
    runningCount,
    failedCount,
    completedCount,
    anomalyCount,
    total: pendingCount + runningCount + failedCount + anomalyCount,
    totalInputTokens,
    totalOutputTokens,
    avgTokensPerTask,
  };

  return { items, stats };
}

export async function getTaskQueueForAuthorizedLedger(
  ledgerId: string
): Promise<TaskQueueResult> {
  return getTaskQueueForLedgerQuery(ledgerId);
}

export const getTaskQueueAction = withLedgerAccess(getTaskQueueForLedgerQuery);

export type { TaskQueueResult, TaskQueueStats } from "./types";
