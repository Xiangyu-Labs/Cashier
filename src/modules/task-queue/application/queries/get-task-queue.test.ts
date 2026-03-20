import { beforeEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { getTestDb } from "tests/setup";
import { ledgers, sourceDocuments, taskRuns } from "@/persistence";
import { getTaskQueueQuery } from "./get-task-queue";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

describe("getTaskQueueQuery", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();

    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("excludes soft-deleted task runs and source documents", async () => {
    const db = getTestDb();
    const activeTaskId = uuidv4();
    const deletedTaskId = uuidv4();
    const activeAnomalyId = uuidv4();
    const deletedAnomalyId = uuidv4();

    await db.insert(taskRuns).values([
      {
        id: activeTaskId,
        type: "parse_source_document",
        title: "Active",
        status: "pending",
        scopeId: ledgerId,
      },
      {
        id: deletedTaskId,
        type: "parse_source_document",
        title: "Deleted",
        status: "pending",
        scopeId: ledgerId,
        deletedAt: new Date(),
      },
    ]);

    await db.insert(sourceDocuments).values([
      {
        id: activeAnomalyId,
        ledgerId,
        text: "active anomaly",
        status: "anomaly",
        type: "ai_parsed",
        imageUrls: [],
      },
      {
        id: deletedAnomalyId,
        ledgerId,
        text: "deleted anomaly",
        status: "anomaly",
        type: "ai_parsed",
        imageUrls: [],
        deletedAt: new Date(),
      },
    ]);

    const result = await getTaskQueueQuery(ledgerId);
    const ids = new Set(result.items.map((item) => item.id));

    expect(ids.has(activeTaskId)).toBe(true);
    expect(ids.has(activeAnomalyId)).toBe(true);
    expect(ids.has(deletedTaskId)).toBe(false);
    expect(ids.has(deletedAnomalyId)).toBe(false);
    expect(result.stats.pendingCount).toBe(1);
    expect(result.stats.anomalyCount).toBe(1);
    expect(result.stats.total).toBe(2);
  });

  it("rewrites completed parse task title using source document title", async () => {
    const db = getTestDb();
    const sourceDocumentId = uuidv4();

    await db.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ledgerId,
      title: "March Receipt",
      text: "doc",
      status: "completed",
      type: "ai_parsed",
      imageUrls: [],
    });

    await db.insert(taskRuns).values({
      id: uuidv4(),
      type: "parse_source_document",
      title: "Original parse title",
      status: "completed",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: sourceDocumentId,
      completedAt: new Date(),
    });

    const result = await getTaskQueueQuery(ledgerId);
    const completedItems = result.items.filter((item) => item.status === "completed");
    const completedItem = requireFirst(completedItems, "completed queue item");

    expect(completedItem.title).toBe("解析原始凭证：March Receipt");
    expect(completedItem.sourceDocumentId).toBe(sourceDocumentId);
  });

  it("keeps original task title when source document title is null", async () => {
    const db = getTestDb();
    const sourceDocumentId = uuidv4();

    await db.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ledgerId,
      title: null,
      text: "doc",
      status: "completed",
      type: "ai_parsed",
      imageUrls: [],
    });

    await db.insert(taskRuns).values({
      id: uuidv4(),
      type: "parse_source_document",
      title: "Keep this title",
      status: "completed",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: sourceDocumentId,
      completedAt: new Date(),
    });

    const result = await getTaskQueueQuery(ledgerId);
    const completedItems = result.items.filter((item) => item.status === "completed");
    const completedItem = requireFirst(completedItems, "completed queue item");

    expect(completedItem.title).toBe("Keep this title");
  });
});
