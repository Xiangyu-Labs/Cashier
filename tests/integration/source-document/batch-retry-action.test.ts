import { describe, it, expect, beforeEach, vi } from "vitest";
import { batchRetrySourceDocumentsAction } from "@/features/source-document/server/actions/batch-retry";
import { getTestDb } from "../../setup";
import { sourceDocuments, taskRuns, ledgers, entryCategories } from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { flowEngine } from "@/lib/flow";

// Mock flowEngine to avoid registration issues
vi.mock("@/lib/flow", async () => {
    const actual = await vi.importActual("@/lib/flow");
    return {
        ...actual,
        flowEngine: {
            register: vi.fn(),
            cancel: vi.fn(),
            submit: vi.fn(),
        },
    };
});

describe("batchRetrySourceDocumentsAction", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        vi.clearAllMocks();

        const db = getTestDb();
        // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const { ledgerId } = await createTestUserWithLedger(db, undefined, "Batch Retry Test Ledger", TEST_USER_ID);
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
        const [doc1] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Receipt 1",
            imageUrls: ["https://example.com/img1.jpg"],
            status: "anomaly",
            entryDate: "2025-01-15",
            title: "Title 1",
        }).returning();

        const [doc2] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Receipt 2",
            imageUrls: ["https://example.com/img2.jpg"],
            status: "failed",
            entryDate: "2025-02-20",
            title: "Title 2",
        }).returning();

        const oldDocIds = [doc1.id, doc2.id];

        // Call batch retry
        await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

        // Verify old documents are soft deleted
        const oldDocs = await db.query.sourceDocuments.findMany({
            where: and(
                inArray(sourceDocuments.id, oldDocIds),
                isNull(sourceDocuments.deletedAt)
            ),
        });
        expect(oldDocs.length).toBe(0);

        // Verify new documents are created
        const allDocs = await db.query.sourceDocuments.findMany({
            where: eq(sourceDocuments.ledgerId, testLedgerId),
        });
        const newDocs = allDocs.filter(d => !oldDocIds.includes(d.id));
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
        const dates = newDocs.map(d => d.entryDate).sort();
        expect(dates).toEqual(["2025-01-15", "2025-02-20"]);
    });

    it("should preserve text and imageUrls from old documents", async () => {
        const db = getTestDb();

        // Create old documents with specific text and images
        const [doc1] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Specific text 1",
            imageUrls: ["https://example.com/specific1.jpg"],
            status: "anomaly",
            entryDate: "2025-03-01",
        }).returning();

        const [doc2] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Specific text 2",
            imageUrls: ["https://example.com/specific2.jpg", "https://example.com/specific3.jpg"],
            status: "failed",
            entryDate: "2025-03-02",
        }).returning();

        const oldDocIds = [doc1.id, doc2.id];

        // Call batch retry
        await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

        // Get all non-deleted documents
        const activeDocs = await db.query.sourceDocuments.findMany({
            where: and(
                eq(sourceDocuments.ledgerId, testLedgerId),
                isNull(sourceDocuments.deletedAt)
            ),
        });

        // Find documents by their text (should be preserved from old docs)
        const texts = activeDocs.map(d => d.text).sort();
        expect(texts).toEqual(["Specific text 1", "Specific text 2"]);

        // Verify imageUrls are preserved
        const urls = activeDocs.map(d => d.imageUrls).sort();
        expect(urls).toEqual([
            ["https://example.com/specific1.jpg"],
            ["https://example.com/specific2.jpg", "https://example.com/specific3.jpg"],
        ]);
    });

    it("should cancel running tasks and create new tasks", async () => {
        const db = getTestDb();

        // Create old documents with running tasks
        const [doc1] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Processing 1",
            status: "processing",
            entryDate: "2025-04-01",
        }).returning();

        const [doc2] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Pending 2",
            status: "queued",
            entryDate: "2025-04-02",
        }).returning();

        const oldDocIds = [doc1.id, doc2.id];

        // Create running tasks for the old documents
        const [task1] = await db.insert(taskRuns).values({
            scopeId: testLedgerId,
            entityType: "source_document",
            entityId: doc1.id,
            type: "parse_source_document",
            status: "running",
            title: "Parse doc1",
        }).returning();

        const [task2] = await db.insert(taskRuns).values({
            scopeId: testLedgerId,
            entityType: "source_document",
            entityId: doc2.id,
            type: "parse_source_document",
            status: "pending",
            title: "Parse doc2",
        }).returning();

        // Call batch retry
        await batchRetrySourceDocumentsAction(testLedgerId, oldDocIds);

        // Verify old tasks were cancelled
        expect(flowEngine.cancel).toHaveBeenCalledWith(task1.id);
        expect(flowEngine.cancel).toHaveBeenCalledWith(task2.id);

        // Verify new tasks were submitted for new documents
        expect(flowEngine.submit).toHaveBeenCalledTimes(2);

        // Get all non-deleted documents
        const activeDocs = await db.query.sourceDocuments.findMany({
            where: and(
                eq(sourceDocuments.ledgerId, testLedgerId),
                isNull(sourceDocuments.deletedAt)
            ),
        });

        // Verify new task IDs match new document IDs
        const submitCalls = vi.mocked(flowEngine.submit).mock.calls;
        const newDocIds = activeDocs.map(d => d.id);
        for (const call of submitCalls) {
            expect(newDocIds).toContain(call[1].sourceDocumentId);
        }
    });

    it("should soft delete old task_runs", async () => {
        const db = getTestDb();

        // Create old documents with completed tasks
        const [doc1] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Completed doc",
            status: "completed",
            entryDate: "2025-05-01",
        }).returning();

        const [doc2] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Failed doc",
            status: "failed",
            entryDate: "2025-05-02",
        }).returning();

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
            where: and(
                inArray(taskRuns.entityId, oldDocIds),
                isNull(taskRuns.deletedAt)
            ),
        });
        expect(oldTasks.length).toBe(0);
    });

    it("should handle empty document list gracefully", async () => {
        // Call batch retry with empty list
        await batchRetrySourceDocumentsAction(testLedgerId, []);

        // Verify no tasks were submitted
        expect(flowEngine.submit).not.toHaveBeenCalled();
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
        expect(flowEngine.submit).not.toHaveBeenCalled();
    });

    it("should handle partial failures in batch", async () => {
        const db = getTestDb();

        // Create one valid document
        const [doc1] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Valid doc",
            status: "anomaly",
            entryDate: "2025-06-01",
        }).returning();

        // Mock flowEngine.submit to fail for one document
        vi.mocked(flowEngine.submit).mockImplementation(async (type, data) => {
            if (data.sourceDocumentId !== doc1.id) {
                throw new Error("Simulated failure");
            }
        });

        // Call batch retry with one valid and one invalid ID
        await batchRetrySourceDocumentsAction(testLedgerId, [
            doc1.id,
            "00000000-0000-0000-0000-000000000000", // Non-existent
        ]);

        // Verify valid document was still processed
        const activeDocs = await db.query.sourceDocuments.findMany({
            where: and(
                eq(sourceDocuments.ledgerId, testLedgerId),
                isNull(sourceDocuments.deletedAt)
            ),
        });
        expect(activeDocs.length).toBe(1);
        expect(activeDocs[0].text).toBe("Valid doc");
    });

    it("should only process active documents (not already deleted)", async () => {
        const db = getTestDb();

        // Create an active document
        const [activeDoc] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Active doc",
            status: "anomaly",
            entryDate: "2025-07-01",
        }).returning();

        // Create a soft-deleted document
        const [deletedDoc] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            text: "Deleted doc",
            status: "completed",
            entryDate: "2025-07-02",
            deletedAt: new Date(),
        }).returning();

        // Call batch retry with both IDs
        await batchRetrySourceDocumentsAction(testLedgerId, [activeDoc.id, deletedDoc.id]);

        // Verify only one new document created (for the active one)
        const newDocs = await db.query.sourceDocuments.findMany({
            where: and(
                eq(sourceDocuments.ledgerId, testLedgerId),
                isNull(sourceDocuments.deletedAt)
            ),
        });
        expect(newDocs.length).toBe(1);
        expect(newDocs[0].text).toBe("Active doc");
    });
});
