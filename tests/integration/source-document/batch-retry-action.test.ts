import { describe, it, expect, beforeEach, vi } from "vitest";
import { batchRetrySourceDocumentsAction } from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, taskRuns, ledgers, entryCategories } from "@/persistence";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getLocalStorage } from "@/lib/storage/local";

const { submitMock, cancelMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock("@/lib/flow", async () => {
  const actual = await vi.importActual("@/lib/flow");
  return {
    ...actual,
    submitFlowTask: submitMock,
    cancelFlowTask: cancelMock,
  };
});

import { cancelFlowTask, submitFlowTask } from "@/lib/flow";

describe("batchRetrySourceDocumentsAction", () => {
  let testLedgerId: string;

  type SubmitInput = {
    sourceDocumentId: string;
    ledgerId: string;
    text?: string;
  };

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function parseSubmitInput(value: unknown): SubmitInput {
    if (!isRecord(value)) {
      throw new Error("submitFlowTask payload must be an object");
    }
    const sourceDocumentId = value.sourceDocumentId;
    const ledgerId = value.ledgerId;
    const text = value.text;
    if (typeof sourceDocumentId !== "string") {
      throw new Error("submitFlowTask payload.sourceDocumentId must be a string");
    }
    if (typeof ledgerId !== "string") {
      throw new Error("submitFlowTask payload.ledgerId must be a string");
    }
    if (text !== undefined && typeof text !== "string") {
      throw new Error("submitFlowTask payload.text must be a string when provided");
    }
    return text === undefined
      ? { sourceDocumentId, ledgerId }
      : { sourceDocumentId, ledgerId, text };
  }

  function firstItem<T>(items: T[], errorMessage: string): T {
    const first = items[0];
    if (first == null) {
      throw new Error(errorMessage);
    }
    return first;
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = getTestDb();
    // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      "Batch Retry Test Ledger",
      TEST_USER_ID
    );
    testLedgerId = ledgerId;

    // Create a test category
    await db.insert(entryCategories).values({
      ledgerId: testLedgerId,
      name: "餐饮",
      description: "餐饮类别",
      sortOrder: 1,
    });
  });

  it("should create new documents and soft delete old documents", async () => {
    const db = getTestDb();

    // Create multiple old documents
    const doc1 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Receipt 1",
          imageUrls: ["https://example.com/img1.jpg"],
          status: "anomaly",
          entryDate: "2025-01-15",
          title: "Title 1",
        })
        .returning(),
      "Expected first source document to be created"
    );

    const doc2 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Receipt 2",
          imageUrls: ["https://example.com/img2.jpg"],
          status: "failed",
          entryDate: "2025-02-20",
          title: "Title 2",
        })
        .returning(),
      "Expected second source document to be created"
    );

    const oldDocIds = [doc1.id, doc2.id];

    // Call batch retry
    await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

    // Verify old documents are soft deleted
    const oldDocs = await db.query.sourceDocuments.findMany({
      where: and(inArray(sourceDocuments.id, oldDocIds), isNull(sourceDocuments.deletedAt)),
    });
    expect(oldDocs.length).toBe(0);

    const deletedOldDocs = await db.query.sourceDocuments.findMany({
      where: inArray(sourceDocuments.id, oldDocIds),
    });
    expect(deletedOldDocs).toHaveLength(2);
    deletedOldDocs.forEach((doc) => {
      expect(doc.status).toBe("deleted");
      expect(doc.deletedAt).not.toBeNull();
    });

    // Verify new documents are created
    const allDocs = await db.query.sourceDocuments.findMany({
      where: eq(sourceDocuments.ledgerId, testLedgerId),
    });
    const newDocs = allDocs.filter((d) => !oldDocIds.includes(d.id));
    expect(newDocs.length).toBe(2);

    // Verify new documents have correct data
    for (const newDoc of newDocs) {
      expect(newDoc.ledgerId).toBe(testLedgerId);
      expect(newDoc.status).toBe("queued");
      expect(newDoc.deletedAt).toBeNull();
      expect(newDoc.title).toBeNull(); // AI regenerates
      expect(newDoc.metadata).toEqual({}); // Empty for fresh parse
    }

    // Verify entryDate is preserved
    const dates = newDocs.map((d) => d.entryDate).sort();
    expect(dates).toEqual(["2025-01-15", "2025-02-20"]);
  });

  it("should preserve text and imageUrls from old documents", async () => {
    const db = getTestDb();

    // Create old documents with specific text and images
    const doc1 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Specific text 1",
          imageUrls: ["https://example.com/specific1.jpg"],
          status: "anomaly",
          entryDate: "2025-03-01",
        })
        .returning(),
      "Expected first specific source document to be created"
    );

    const doc2 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Specific text 2",
          imageUrls: ["https://example.com/specific2.jpg", "https://example.com/specific3.jpg"],
          status: "failed",
          entryDate: "2025-03-02",
        })
        .returning(),
      "Expected second specific source document to be created"
    );

    const oldDocIds = [doc1.id, doc2.id];

    // Call batch retry
    await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

    // Get all non-deleted documents
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(eq(sourceDocuments.ledgerId, testLedgerId), isNull(sourceDocuments.deletedAt)),
    });

    // Find documents by their text (should be preserved from old docs)
    const texts = activeDocs.map((d) => d.text).sort();
    expect(texts).toEqual(["Specific text 1", "Specific text 2"]);

    // Verify imageUrls are preserved
    const urls = activeDocs.map((d) => d.imageUrls).sort();
    expect(urls).toEqual([
      ["https://example.com/specific1.jpg"],
      ["https://example.com/specific2.jpg", "https://example.com/specific3.jpg"],
    ]);
  });

  it("should rehome local image urls into each new source document namespace", async () => {
    const db = getTestDb();
    const localStorage = getLocalStorage();
    const oldDocId = crypto.randomUUID();
    const oldLocalUrl = await localStorage.upload(
      `${testLedgerId}/${oldDocId}/local.webp`,
      Buffer.from("local-image"),
      "image/webp"
    );
    const oldOriginalLocalUrl = await localStorage.upload(
      `${testLedgerId}/${oldDocId}/original.webp`,
      Buffer.from("original-local-image"),
      "image/webp"
    );

    const oldDoc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          id: oldDocId,
          ledgerId: testLedgerId,
          text: "Local image retry",
          imageUrls: [oldLocalUrl],
          metadata: { originalImageUrls: [oldOriginalLocalUrl] },
          status: "failed",
          entryDate: "2025-03-03",
        })
        .returning(),
      "Expected local-image source document to be created"
    );

    await batchRetrySourceDocumentsAction(testLedgerId, [oldDoc.id]);

    const newDocs = await db.query.sourceDocuments.findMany({
      where: and(
        eq(sourceDocuments.ledgerId, testLedgerId),
        isNull(sourceDocuments.deletedAt),
        inArray(sourceDocuments.id, [oldDoc.id])
      ),
    });
    expect(newDocs.length).toBe(0);

    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(eq(sourceDocuments.ledgerId, testLedgerId), isNull(sourceDocuments.deletedAt)),
    });
    expect(activeDocs.length).toBe(1);
    const newDoc = firstItem(activeDocs, "Expected one active retried document");
    expect(newDoc.id).not.toBe(oldDoc.id);
    expect(newDoc.imageUrls).toBeDefined();
    const firstImageUrl = newDoc.imageUrls?.[0];
    expect(typeof firstImageUrl).toBe("string");
    if (typeof firstImageUrl !== "string") {
      throw new Error("Expected retried document image URL to exist");
    }
    expect(firstImageUrl).toContain(`/${newDoc.id}/`);
    expect(firstImageUrl).not.toContain(`/${oldDoc.id}/`);

    expect(isRecord(newDoc.metadata)).toBe(true);
    if (!isRecord(newDoc.metadata)) {
      throw new Error("Expected retried document metadata to be an object");
    }
    const originalImageUrls = newDoc.metadata.originalImageUrls;
    expect(Array.isArray(originalImageUrls)).toBe(true);
    if (!Array.isArray(originalImageUrls)) {
      throw new Error("Expected retried document metadata.originalImageUrls to be an array");
    }
    const firstOriginalImageUrl = originalImageUrls[0];
    expect(typeof firstOriginalImageUrl).toBe("string");
    if (typeof firstOriginalImageUrl !== "string") {
      throw new Error("Expected retried document original image URL to exist");
    }
    expect(firstOriginalImageUrl).toContain(`/${newDoc.id}/`);
    expect(firstOriginalImageUrl).not.toContain(`/${oldDoc.id}/`);
  });

  it("should cancel running tasks and create new tasks", async () => {
    const db = getTestDb();

    // Create old documents with running tasks
    const doc1 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Processing 1",
          status: "processing",
          entryDate: "2025-04-01",
        })
        .returning(),
      "Expected first processing source document to be created"
    );

    const doc2 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Pending 2",
          status: "queued",
          entryDate: "2025-04-02",
        })
        .returning(),
      "Expected second processing source document to be created"
    );

    const oldDocIds = [doc1.id, doc2.id];

    // Create running tasks for the old documents
    const task1 = firstItem(
      await db
        .insert(taskRuns)
        .values({
          scopeId: testLedgerId,
          entityType: "source_document",
          entityId: doc1.id,
          type: "parse_source_document",
          status: "running",
          title: "Parse doc1",
        })
        .returning(),
      "Expected first task run to be created"
    );

    const task2 = firstItem(
      await db
        .insert(taskRuns)
        .values({
          scopeId: testLedgerId,
          entityType: "source_document",
          entityId: doc2.id,
          type: "parse_source_document",
          status: "pending",
          title: "Parse doc2",
        })
        .returning(),
      "Expected second task run to be created"
    );

    // Call batch retry
    await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

    // Verify old tasks were cancelled
    expect(cancelFlowTask).toHaveBeenCalledWith(task1.id);
    expect(cancelFlowTask).toHaveBeenCalledWith(task2.id);

    // Verify new tasks were submitted for new documents
    expect(submitFlowTask).toHaveBeenCalledTimes(2);

    // Get all non-deleted documents
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(eq(sourceDocuments.ledgerId, testLedgerId), isNull(sourceDocuments.deletedAt)),
    });

    // Verify new task IDs match new document IDs
    const submitCalls = vi.mocked(submitFlowTask).mock.calls;
    const newDocIds = activeDocs.map((d) => d.id);
    for (const call of submitCalls) {
      const input = parseSubmitInput(call[1]);
      expect(newDocIds).toContain(input.sourceDocumentId);
    }
  });

  it("should soft delete old task_runs", async () => {
    const db = getTestDb();

    // Create old documents with completed tasks
    const doc1 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Completed doc",
          status: "completed",
          entryDate: "2025-05-01",
        })
        .returning(),
      "Expected completed source document to be created"
    );

    const doc2 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Failed doc",
          status: "failed",
          entryDate: "2025-05-02",
        })
        .returning(),
      "Expected failed source document to be created"
    );

    const oldDocIds = [doc1.id, doc2.id];

    // Create completed/failed tasks
    await db.insert(taskRuns).values([
      {
        scopeId: testLedgerId,
        entityType: "source_document",
        entityId: doc1.id,
        type: "parse_source_document",
        status: "completed",
        title: "Completed task",
      },
      {
        scopeId: testLedgerId,
        entityType: "source_document",
        entityId: doc2.id,
        type: "parse_source_document",
        status: "failed",
        title: "Failed task",
      },
    ]);

    // Call batch retry
    await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

    // Verify old task_runs are soft deleted
    const oldTasks = await db.query.taskRuns.findMany({
      where: and(inArray(taskRuns.entityId, oldDocIds), isNull(taskRuns.deletedAt)),
    });
    expect(oldTasks.length).toBe(0);
  });

  it("should handle empty document list gracefully", async () => {
    // Call batch retry with empty list
    await batchRetrySourceDocumentsAction(testLedgerId, []);

    // Verify no tasks were submitted
    expect(submitFlowTask).not.toHaveBeenCalled();
  });

  it("should handle non-existent document IDs gracefully", async () => {
    const db = getTestDb();

    // Call batch retry with non-existent IDs
    await batchRetrySourceDocumentsAction(testLedgerId, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);

    // Verify no new documents created and no tasks submitted
    const docs = await db.query.sourceDocuments.findMany({
      where: eq(sourceDocuments.ledgerId, testLedgerId),
    });
    expect(docs.length).toBe(0);
    expect(submitFlowTask).not.toHaveBeenCalled();
  });

  it("should handle partial failures in batch", async () => {
    const db = getTestDb();

    // Create one valid document
    const doc1 = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Valid doc",
          status: "anomaly",
          entryDate: "2025-06-01",
        })
        .returning(),
      "Expected valid source document to be created"
    );

    // Mock submitFlowTask to fail for one document
    vi.mocked(submitFlowTask).mockImplementation(
      async (_type: string, data: unknown): Promise<string> => {
        const input = parseSubmitInput(data);
        if (input.sourceDocumentId !== doc1.id) {
          throw new Error("Simulated failure");
        }
        return "task-id";
      }
    );

    // Call batch retry with one valid and one invalid ID
    await batchRetrySourceDocumentsAction(testLedgerId, [
      doc1.id,
      "00000000-0000-0000-0000-000000000000", // Non-existent
    ]);

    // Verify valid document was still processed
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(eq(sourceDocuments.ledgerId, testLedgerId), isNull(sourceDocuments.deletedAt)),
    });
    expect(activeDocs.length).toBe(1);
    const activeDoc = firstItem(activeDocs, "Expected one active document after partial failure");
    expect(activeDoc.text).toBe("Valid doc");
  });

  it("should only process active documents (not already deleted)", async () => {
    const db = getTestDb();

    // Create an active document
    const activeDoc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Active doc",
          status: "anomaly",
          entryDate: "2025-07-01",
        })
        .returning(),
      "Expected active source document to be created"
    );

    // Create a soft-deleted document
    const deletedDoc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: "Deleted doc",
          status: "completed",
          entryDate: "2025-07-02",
          deletedAt: new Date(),
        })
        .returning(),
      "Expected soft-deleted source document to be created"
    );

    // Call batch retry with both IDs
    await batchRetrySourceDocumentsAction(testLedgerId, [activeDoc.id, deletedDoc.id]);

    // Verify only one new document created (for the active one)
    const newDocs = await db.query.sourceDocuments.findMany({
      where: and(eq(sourceDocuments.ledgerId, testLedgerId), isNull(sourceDocuments.deletedAt)),
    });
    expect(newDocs.length).toBe(1);
    const newDoc = firstItem(newDocs, "Expected one retried active document");
    expect(newDoc.text).toBe("Active doc");
  });

  it("should omit text in task payload when retried document text is null", async () => {
    const db = getTestDb();

    const oldDoc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          text: null,
          status: "failed",
          entryDate: "2025-08-01",
        })
        .returning(),
      "Expected source document with null text to be created"
    );

    await batchRetrySourceDocumentsAction(testLedgerId, [oldDoc.id]);

    expect(submitFlowTask).toHaveBeenCalledTimes(1);
    const submitCall = vi.mocked(submitFlowTask).mock.calls[0];
    expect(submitCall).toBeDefined();
    if (submitCall == null) {
      throw new Error("Expected submitFlowTask to be called");
    }
    const submitInput = submitCall[1];
    expect(isRecord(submitInput)).toBe(true);
    if (!isRecord(submitInput)) {
      throw new Error("Expected submitFlowTask payload to be an object");
    }
    expect(Object.prototype.hasOwnProperty.call(submitInput, "text")).toBe(false);
  });
});
