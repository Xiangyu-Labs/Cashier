import { describe, expect, it } from "vitest";
import {
  markItemsPendingBySourceDocId,
  removeItemsById,
  removeItemsBySourceDocId,
} from "@/modules/task-queue/ui/taskQueueOptimistic";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";

function createTaskQueueResult(): TaskQueueResult {
  return {
    items: [
      {
        id: "task-1",
        kind: "task",
        status: "failed",
        title: "Receipt 1",
        createdAt: "2026-03-20T00:00:00.000Z",
        sourceDocumentId: "doc-1",
      },
      {
        id: "task-2",
        kind: "task",
        status: "completed",
        title: "Receipt 2",
        createdAt: "2026-03-20T00:00:00.000Z",
        sourceDocumentId: "doc-2",
      },
    ],
    stats: {
      pendingCount: 0,
      runningCount: 0,
      failedCount: 1,
      completedCount: 1,
      anomalyCount: 0,
      total: 2,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgTokensPerTask: 0,
    },
  };
}

describe("taskQueueOptimistic", () => {
  it("returns old data when task queue items are missing", () => {
    expect(removeItemsById({ stats: { total: 5 } } as never, ["task-1"])).toEqual({
      stats: { total: 5 },
    });
  });

  it("returns old data when source-document removal sees malformed cache", () => {
    expect(removeItemsBySourceDocId({ stats: { total: 5 } } as never, ["doc-1"])).toEqual({
      stats: { total: 5 },
    });
  });

  it("removes matching tasks by source document id and updates totals", () => {
    expect(removeItemsBySourceDocId(createTaskQueueResult(), ["doc-1"])).toMatchObject({
      items: [{ id: "task-2" }],
      stats: { total: 1 },
    });
  });

  it("marks matching source-document tasks as pending", () => {
    expect(markItemsPendingBySourceDocId(createTaskQueueResult(), ["doc-1"])).toMatchObject({
      items: [{ id: "task-1", status: "pending" }, { id: "task-2", status: "completed" }],
    });
  });
});
