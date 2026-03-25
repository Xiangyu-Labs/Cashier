import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SourceDocumentStatus } from "@/modules/source-document/contracts";
import { sourceDocuments, taskRuns } from "@/persistence";
import {
  anomalyDocToQueueItem,
  getSourceDocumentId,
  taskRunToQueueItem,
} from "@/modules/task-queue/application/mappers";
import type { QueueItem, TaskQueueResult, TaskQueueStats } from "@/modules/task-queue/contracts";

function whereTaskQueueSourceDocumentActive(ledgerId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    ne(sourceDocuments.status, SourceDocumentStatus.Deleted),
    isNull(sourceDocuments.deletedAt)
  )!;
}

export async function getTaskQueueQuery(ledgerId: string): Promise<TaskQueueResult> {
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
    where: and(whereTaskQueueSourceDocumentActive(ledgerId), eq(sourceDocuments.status, "anomaly")),
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
      where: and(
        inArray(sourceDocuments.id, completedSourceDocIds),
        whereTaskQueueSourceDocumentActive(ledgerId)
      ),
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

  const pendingCount = items.filter((item) => item.status === "pending").length;
  const runningCount = items.filter((item) => item.status === "running").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const anomalyCount = items.filter((item) => item.status === "anomaly").length;

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
