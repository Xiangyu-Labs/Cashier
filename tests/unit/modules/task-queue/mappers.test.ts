import { describe, expect, it } from "vitest";
import { anomalyDocToQueueItem, taskRunToQueueItem } from "@/modules/task-queue/application/mappers";
import type { SourceDocument, TaskRun } from "@/persistence";

function hasOwnKey<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function createTaskRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "task-1",
    type: "parse_source_document",
    title: "Parse document",
    input: null,
    deduplicationKey: null,
    scopeId: null,
    entityType: null,
    entityId: null,
    status: "failed",
    error: null,
    progress: null,
    tokenUsage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function createSourceDocument(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: null,
    text: null,
    imageUrls: [],
    status: "anomaly",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: null,
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("task-queue mappers", () => {
  it("omits optional task fields when source values are null", () => {
    const queueItem = taskRunToQueueItem(createTaskRun());

    expect(hasOwnKey(queueItem, "subtitle")).toBe(false);
    expect(hasOwnKey(queueItem, "progress")).toBe(false);
    expect(hasOwnKey(queueItem, "entityType")).toBe(false);
    expect(hasOwnKey(queueItem, "entityId")).toBe(false);
    expect(hasOwnKey(queueItem, "sourceDocumentId")).toBe(false);
  });

  it("omits task-only fields for anomaly queue items", () => {
    const queueItem = anomalyDocToQueueItem(createSourceDocument());

    expect(hasOwnKey(queueItem, "subtitle")).toBe(false);
    expect(hasOwnKey(queueItem, "taskId")).toBe(false);
    expect(hasOwnKey(queueItem, "taskType")).toBe(false);
  });
});
