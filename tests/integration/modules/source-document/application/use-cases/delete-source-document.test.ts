import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";
import { ledgerEntries, sourceDocuments, taskRuns } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

const { cancelMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(),
}));

vi.mock("@/lib/flow", async () => {
  const actual = await vi.importActual("@/lib/flow");
  return {
    ...actual,
    cancelFlowTask: cancelMock,
  };
});

describe("deleteSourceDocument", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    cancelMock.mockResolvedValue(undefined);

    const db = getTestDb();
    ({ ledgerId } = await createTestUserWithLedger(db, undefined, "Lifecycle Delete Ledger"));
  });

  it("cancels active tasks, soft deletes entries, and soft deletes related task runs", async () => {
    const db = getTestDb();
    const [sourceDocument] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "Delete me",
        imageUrls: [],
        status: "completed",
        entryDate: "2026-03-22",
      })
      .returning();

    if (sourceDocument == null) {
      throw new Error("Expected source document to be created");
    }

    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId,
        sourceDocumentId: sourceDocument.id,
        categoryId: null,
        amount: "8.90",
        currency: "USD",
        itemName: "Coffee",
        description: "Seeded ledger entry",
      })
      .returning();

    const [runningTask, completedTask] = await db
      .insert(taskRuns)
      .values([
        {
          scopeId: ledgerId,
          entityType: "source_document",
          entityId: sourceDocument.id,
          type: "parse_source_document",
          status: "running",
          title: "Running parse",
        },
        {
          scopeId: ledgerId,
          entityType: "source_document",
          entityId: sourceDocument.id,
          type: "parse_source_document",
          status: "completed",
          title: "Completed parse",
        },
      ])
      .returning();

    if (entry == null || runningTask == null || completedTask == null) {
      throw new Error("Expected delete lifecycle fixtures to be created");
    }

    const result = await deleteSourceDocument({
      ledgerId,
      sourceDocumentId: sourceDocument.id,
    });

    expect(result).toEqual({
      sourceDocumentId: sourceDocument.id,
      deleted: true,
    });

    const deletedDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocument.id),
    });
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, sourceDocument.id),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    const activeTaskRuns = await db.query.taskRuns.findMany({
      where: and(eq(taskRuns.entityId, sourceDocument.id), isNull(taskRuns.deletedAt)),
    });

    expect(deletedDocument).toMatchObject({
      id: sourceDocument.id,
      status: "deleted",
      deletedAt: expect.any(Date),
    });
    expect(activeEntries).toEqual([]);
    expect(activeTaskRuns).toEqual([]);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(runningTask.id);
    expect(cancelMock).not.toHaveBeenCalledWith(completedTask.id);
  });
});
