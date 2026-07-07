import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import {
  entryCategories,
  ledgerEntries,
  ledgers,
  sourceDocuments,
  taskRuns,
  type Ledger,
} from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

const { submitMock, cancelMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock("@/lib/tasks", async () => {
  const actual = await vi.importActual("@/lib/tasks");
  return {
    ...actual,
    submitTask: submitMock,
    cancelTask: cancelMock,
  };
});

describe("retrySourceDocument", () => {
  let ledgerId: string;
  let ledger: Ledger;

  beforeEach(async () => {
    vi.clearAllMocks();
    submitMock.mockResolvedValue("queued-task-id");
    cancelMock.mockResolvedValue(undefined);

    const db = getTestDb();
    ({ ledgerId } = await createTestUserWithLedger(db, undefined, "Lifecycle Retry Ledger"));

    await db.insert(entryCategories).values({
      ledgerId,
      name: "Meals",
      description: "Meal purchases",
      sortOrder: 1,
    });

    const persistedLedger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    if (persistedLedger == null) {
      throw new Error("Expected test ledger to exist");
    }
    ledger = persistedLedger;
  });

  it("clones the document, soft deletes the original lifecycle rows, and queues a replacement task", async () => {
    const db = getTestDb();
    const [originalDocument] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "Original receipt",
        imageUrls: [],
        status: "completed",
        entryDate: "2026-03-22",
      })
      .returning();

    if (originalDocument == null) {
      throw new Error("Expected original source document to be created");
    }

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId,
        sourceDocumentId: originalDocument.id,
        categoryId: null,
        amount: "14.20",
        currency: "USD",
        itemName: "Lunch",
        description: "Seeded receipt entry",
      })
      .returning();

    const [runningTask] = await db
      .insert(taskRuns)
      .values({
        scopeId: ledgerId,
        entityType: "source_document",
        entityId: originalDocument.id,
        type: "parse_source_document",
        status: "running",
        title: "Parse source document",
      })
      .returning();

    if (entry == null || runningTask == null) {
      throw new Error("Expected lifecycle fixtures to be created");
    }

    const result = await retrySourceDocument({
      ledgerId,
      ledger,
      sourceDocumentId: originalDocument.id,
    });

    expect(result).toMatchObject({
      previousSourceDocumentId: originalDocument.id,
      sourceDocumentId: expect.any(String),
      status: "queued",
    });
    expect(result.sourceDocumentId).not.toBe(originalDocument.id);

    const deletedOriginal = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, originalDocument.id),
    });
    const replacement = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });

    expect(deletedOriginal).toMatchObject({
      id: originalDocument.id,
      status: "deleted",
      deletedAt: expect.any(Date),
    });
    expect(replacement).toMatchObject({
      id: result.sourceDocumentId,
      ledgerId,
      status: "queued",
      deletedAt: null,
    });

    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, originalDocument.id),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    const activeTaskRuns = await db.query.taskRuns.findMany({
      where: and(eq(taskRuns.entityId, originalDocument.id), isNull(taskRuns.deletedAt)),
    });

    expect(activeEntries).toEqual([]);
    expect(activeTaskRuns).toEqual([]);
    expect(cancelMock).toHaveBeenCalledWith(runningTask.id);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});
