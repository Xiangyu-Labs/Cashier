import { describe, expect, it } from "vitest";
import type { QueueItem, TaskQueueStats } from "@/modules/task-queue/contracts";
import {
  collectSourceDocumentIds,
  collectTaskIds,
  groupTaskQueueItems,
  isTaskQueueEmpty,
  partitionFailedItems,
} from "@/modules/task-queue/ui/taskQueueModal.selectors";

function createItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Queue item",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const baseStats: TaskQueueStats = {
  pendingCount: 0,
  runningCount: 0,
  failedCount: 0,
  completedCount: 0,
  anomalyCount: 0,
  total: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  avgTokensPerTask: 0,
};

describe("taskQueueModal.selectors", () => {
  it("groups queue items by status and partitions failed items by source-document linkage", () => {
    const grouped = groupTaskQueueItems([
      createItem({ id: "pending-1", status: "pending" }),
      createItem({ id: "running-1", status: "running" }),
      createItem({ id: "failed-doc", status: "failed", sourceDocumentId: "doc-1" }),
      createItem({ id: "failed-no-doc", status: "failed" }),
      createItem({ id: "completed-1", status: "completed" }),
      createItem({
        id: "anomaly-1",
        kind: "anomaly",
        status: "anomaly",
        sourceDocumentId: "doc-2",
      }),
    ]);

    expect(grouped.pending.map((item) => item.id)).toEqual(["pending-1"]);
    expect(grouped.running.map((item) => item.id)).toEqual(["running-1"]);
    expect(grouped.failed.map((item) => item.id)).toEqual(["failed-doc", "failed-no-doc"]);
    expect(grouped.completed.map((item) => item.id)).toEqual(["completed-1"]);
    expect(grouped.anomaly.map((item) => item.id)).toEqual(["anomaly-1"]);

    const partition = partitionFailedItems(grouped.failed);

    expect(partition.withSourceDoc.map((item) => item.id)).toEqual(["failed-doc"]);
    expect(partition.withoutSourceDoc.map((item) => item.id)).toEqual(["failed-no-doc"]);
  });

  it("collects only non-empty source-document and task ids", () => {
    expect(
      collectSourceDocumentIds([
        createItem({ sourceDocumentId: "doc-1" }),
        createItem({ sourceDocumentId: "" }),
        createItem({ sourceDocumentId: null as never }),
        createItem({ sourceDocumentId: undefined }),
      ])
    ).toEqual(["doc-1"]);

    expect(
      collectTaskIds([
        createItem({ taskId: "task-1" }),
        createItem({ taskId: "" }),
        createItem({ taskId: null as never }),
        createItem({ taskId: undefined }),
      ])
    ).toEqual(["task-1"]);
  });

  it("treats the queue as empty only when stats total is zero and there are no completed items", () => {
    expect(isTaskQueueEmpty(baseStats, groupTaskQueueItems([]))).toBe(true);

    expect(
      isTaskQueueEmpty(
        baseStats,
        groupTaskQueueItems([createItem({ id: "completed-1", status: "completed" })])
      )
    ).toBe(false);

    expect(
      isTaskQueueEmpty(
        {
          ...baseStats,
          total: 1,
          pendingCount: 1,
        },
        groupTaskQueueItems([createItem({ id: "pending-1", status: "pending" })])
      )
    ).toBe(false);
  });
});
