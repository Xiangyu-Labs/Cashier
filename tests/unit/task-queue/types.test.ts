import { describe, expect, it } from "vitest";
import type { QueueItem } from "@/modules/task-queue/contracts";
import {
  canCancel,
  canDelete,
  canDismiss,
  canRetry,
  hasSourceDocument,
} from "@/modules/task-queue/types";

function createQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Parse document",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("task-queue helpers", () => {
  it("detects source document backed items from the public contract shape", () => {
    const item = createQueueItem({
      kind: "anomaly",
      status: "anomaly",
      entityType: "source_document",
      entityId: "doc-1",
      sourceDocumentId: "doc-1",
    });

    expect(hasSourceDocument(item)).toBe(true);
    expect(canRetry(item)).toBe(true);
    expect(canDelete(item)).toBe(true);
  });

  it("allows cancelling task-only pending items without source documents", () => {
    const item = createQueueItem({
      status: "pending",
      taskId: "task-1",
      taskType: "sync_ledger",
    });

    expect(canCancel(item)).toBe(true);
    expect(canDismiss(item)).toBe(false);
  });

  it("allows dismissing failed task-only items", () => {
    const item = createQueueItem({
      taskId: "task-1",
      taskType: "sync_ledger",
    });

    expect(canDismiss(item)).toBe(true);
    expect(canRetry(item)).toBe(false);
  });
});
