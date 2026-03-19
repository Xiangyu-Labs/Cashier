import { describe, it, expect, beforeEach, vi } from "vitest";
import { retrySourceDocumentAction } from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, taskRuns, ledgers, entryCategories } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";

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

describe("retrySourceDocumentAction", () => {
  let testLedgerId: string;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function parseSubmitInput(value: unknown): {
    sourceDocumentId: string;
    ledgerId: string;
    text?: string;
  } {
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

  beforeEach(async () => {
    vi.clearAllMocks();

    const db = getTestDb();
    // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      "Retry Test Ledger",
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

  it("should create new document and soft delete old document on retry", async () => {
    const db = getTestDb();

    // Create an old document
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Old receipt text",
        imageUrls: ["https://example.com/old-image.jpg"],
        status: "anomaly",
        entryDate: "2025-01-15",
        title: "Old Title",
        metadata: { visionDescription: "Old description" },
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Call retry with new text
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "New edited text",
    });

    // Verify result has new document ID
    expect(result.sourceDocumentId).not.toBe(oldDocId);
    expect(result.status).toBe("queued");

    // Verify old document is soft deleted
    const oldDocAfter = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, oldDocId),
    });
    expect(oldDocAfter?.deletedAt).not.toBeNull();
    expect(oldDocAfter?.deletedAt).toBeInstanceOf(Date);

    // Verify new document is created with correct data
    const newDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(newDoc).not.toBeNull();
    expect(newDoc?.ledgerId).toBe(testLedgerId);
    expect(newDoc?.entryDate).toBe("2025-01-15"); // Preserved
    expect(newDoc?.text).toBe("New edited text"); // Updated
    expect(newDoc?.status).toBe("queued");
    expect(newDoc?.deletedAt).toBeNull();
    expect(newDoc?.title).toBeNull(); // Let AI regenerate
    expect(newDoc?.metadata).toEqual({}); // Empty for fresh parse
  });

  it("should preserve imageUrls when no new images provided", async () => {
    const db = getTestDb();

    // Create an old document with images
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Receipt with images",
        imageUrls: ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
        status: "failed",
        entryDate: "2025-02-20",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Call retry without new images
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "Same receipt",
    });

    // Verify new document preserves old images
    const newDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(newDoc?.imageUrls).toEqual([
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg",
    ]);
  });

  it("should use new images when provided", async () => {
    const db = getTestDb();

    // Create an old document
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Old receipt",
        imageUrls: ["https://example.com/old.jpg"],
        status: "anomaly",
        entryDate: "2025-03-10",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Call retry with new images (base64 data)
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "Updated receipt",
      images: [{ data: "data:image/jpeg;base64,/9j/4AAQ", mimeType: "image/jpeg" }],
    });

    // Verify new document has new images
    const newDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    // Verify new document has new images stored as local URLs
    expect(newDoc?.imageUrls ?? []).toHaveLength(1);
    expect(newDoc?.imageUrls?.[0]).toMatch(/^\/api\/uploads\//);
  });

  it("should cancel old tasks and create new task", async () => {
    const db = getTestDb();

    // Create an old document
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Processing document",
        status: "processing",
        entryDate: "2025-04-01",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Create a running task for the old document
    const [oldTask] = await db
      .insert(taskRuns)
      .values({
        scopeId: testLedgerId,
        entityType: "source_document",
        entityId: oldDocId,
        type: "parse_source_document",
        status: "running",
        title: "Parse old document",
      })
      .returning();

    // Call retry
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "Retry this",
    });

    // Verify old task was cancelled
    expect(cancelFlowTask).toHaveBeenCalledWith(oldTask.id);

    // Verify new task was submitted
    expect(submitFlowTask).toHaveBeenCalled();
    const submitCall = vi.mocked(submitFlowTask).mock.calls[0];
    expect(submitCall).toBeDefined();
    if (submitCall == null) {
      throw new Error("Expected submitFlowTask to be called");
    }
    const submitInput = parseSubmitInput(submitCall[1]);
    expect(submitCall[0]).toBe("parse_source_document");
    expect(submitInput.sourceDocumentId).toBe(result.sourceDocumentId);
    expect(submitInput.ledgerId).toBe(testLedgerId);
    expect(submitInput.text).toBe("Retry this");
  });

  it("should soft delete old task_runs after retry", async () => {
    const db = getTestDb();

    // Create an old document
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Document with tasks",
        status: "completed",
        entryDate: "2025-05-01",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Create multiple task runs for the old document
    await db.insert(taskRuns).values([
      {
        scopeId: testLedgerId,
        entityType: "source_document",
        entityId: oldDocId,
        type: "parse_source_document",
        status: "completed",
        title: "First parse",
      },
      {
        scopeId: testLedgerId,
        entityType: "source_document",
        entityId: oldDocId,
        type: "parse_source_document",
        status: "failed",
        title: "Retry parse",
      },
    ]);

    // Call retry
    await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "Final retry",
    });

    // Verify old task_runs are soft deleted
    const oldTasks = await db.query.taskRuns.findMany({
      where: and(eq(taskRuns.entityId, oldDocId), isNull(taskRuns.deletedAt)),
    });
    expect(oldTasks.length).toBe(0);
  });

  it("should handle document without entryDate", async () => {
    const db = getTestDb();

    // Create an old document without entryDate
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "No date document",
        status: "anomaly",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Call retry
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId, {
      text: "With date now",
    });

    // Verify new document has null entryDate
    const newDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(newDoc?.entryDate).toBeNull();
  });

  it("should throw NotFoundError when document does not exist", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    await expect(
      retrySourceDocumentAction(testLedgerId, nonExistentId, { text: "Retry" })
    ).rejects.toThrow("Source document");
  });

  it("should use default text if no input text provided", async () => {
    const db = getTestDb();

    // Create an old document
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Original text to keep",
        status: "failed",
        entryDate: "2025-06-01",
      })
      .returning();

    const oldDocId = oldDoc.id;

    // Call retry without text input
    const result = await retrySourceDocumentAction(testLedgerId, oldDocId);

    // Verify new document uses old text
    const newDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(newDoc?.text).toBe("Original text to keep");
  });

  it("should omit text in task payload when both retry input and source document text are absent", async () => {
    const db = getTestDb();

    const oldDoc = (
      await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: null,
        status: "failed",
        entryDate: "2025-06-10",
      })
      .returning()
    )[0];
    expect(oldDoc).toBeDefined();
    if (oldDoc == null) {
      throw new Error("Expected old source document to be created");
    }

    await retrySourceDocumentAction(testLedgerId, oldDoc.id);

    expect(submitFlowTask).toHaveBeenCalled();
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
