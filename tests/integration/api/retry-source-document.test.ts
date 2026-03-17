import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import {
  sourceDocuments,
  ledgerEntries,
  entryCategories as categories,
  ledgers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { createMultiStageMock } from "../../helpers/mocks/openai";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { processAllPendingTasks } from "../../helpers/processing";

// Mock OpenAI
vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: vi.fn(),
  resetOpenAIClient: vi.fn(),
}));

describe("SourceDocument Retry Action", () => {
  let testLedgerId: string;
  let _testCategoryId: string;

  beforeEach(async () => {
    // Reset mock to use multi-stage mock by default
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock() as unknown as ReturnType<typeof getOpenAIClient>
    );

    const db = getTestDb();
    // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    // Setup "餐饮" category
    const [category] = await db
      .insert(categories)
      .values({
        name: "餐饮",
        description: "餐饮服务",
        sortOrder: 1,
        ledgerId: testLedgerId,
      })
      .returning();
    _testCategoryId = category.id;
  });

  it("should retry a document and re-process it", async () => {
    // 1. Create a document
    const createRes = await createSourceDocumentAction(testLedgerId, { text: "Lunch 25" });
    const docId = createRes.sourceDocumentId!;

    // Process it
    await processAllPendingTasks();

    const db = getTestDb();
    const docBefore = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, docId),
    });
    expect(docBefore?.status).toBe("completed");

    // 2. Call retry with new text
    // Note: New retry approach = soft delete old doc + create new doc
    const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Dinner 50" });
    expect(retryRes.status).toBe("queued");
    const newDocId = retryRes.sourceDocumentId!;
    expect(newDocId).not.toBe(docId); // New document has different ID

    // Old document should be soft deleted
    const oldDocAfterRetry = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, docId),
    });
    expect(oldDocAfterRetry?.deletedAt).not.toBeNull();

    // New document should be queued with new text
    const newDocAfterRetry = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, newDocId),
    });
    expect(newDocAfterRetry?.status).toBe("queued");
    expect(newDocAfterRetry?.text).toBe("Dinner 50");

    // 3. Process tasks again
    await processAllPendingTasks();

    // New document should be completed
    const newDocFinal = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, newDocId),
    });
    expect(newDocFinal?.status).toBe("completed");

    // Verify entries on NEW document
    const newEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, newDocId),
    });
    const activeNewEntries = newEntries.filter((e) => !e.deletedAt);
    expect(activeNewEntries.length).toBeGreaterThan(0);

    // Old document entries are NOT soft-deleted but linked to deleted source doc
    // They become invisible because their source doc is soft deleted
    const oldEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, docId),
    });
    // Entries remain but source doc is deleted, so they're effectively hidden
    expect(oldEntries.length).toBeGreaterThan(0);
  });

  it("should retry an anomaly document", async () => {
    // 1. Simulate an anomaly
    const db = getTestDb();
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        status: "anomaly",
        text: "Invalid data",
        anomalyReason: "无效内容",
      })
      .returning();
    const docId = doc.id;

    // 2. Retry it
    // Note: New retry approach = soft delete old doc + create new doc
    const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Fixed data" });
    expect(retryRes.status).toBe("queued");
    const newDocId = retryRes.sourceDocumentId!;
    expect(newDocId).not.toBe(docId); // New document has different ID

    // Old document should be soft deleted
    const oldDocAfterRetry = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, docId),
    });
    expect(oldDocAfterRetry?.deletedAt).not.toBeNull();

    // New document should be queued
    const newDocAfterRetry = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, newDocId),
    });
    expect(newDocAfterRetry?.status).toBe("queued");

    // 3. Process
    await processAllPendingTasks();

    // New document should be completed
    const newDocFinal = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, newDocId),
    });
    expect(newDocFinal?.status).toBe("completed");
  });

  it("should replace old entries with new entries on retry", async () => {
    const db = getTestDb();

    // First processing: "午餐 25元"
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock({
        entries: [
          {
            item_name: "午餐",
            amount: 25,
            currency: "CNY",
            category_index: 1,
            entry_date: "2025-01-25",
          },
        ],
        title: "午餐消费",
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );

    const createRes = await createSourceDocumentAction(testLedgerId, { text: "午餐 25元" });
    const docId = createRes.sourceDocumentId!;
    await processAllPendingTasks();

    // Verify first entry on original document
    const entriesBeforeRetry = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, docId),
    });
    const activeBeforeRetry = entriesBeforeRetry.filter((e) => !e.deletedAt);
    expect(activeBeforeRetry.length).toBe(1);
    expect(activeBeforeRetry[0].itemName).toBe("午餐");
    expect(activeBeforeRetry[0].amount).toBe("25.00");

    // Switch to second response for retry: "晚餐 50元"
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock({
        entries: [
          {
            item_name: "晚餐",
            amount: 50,
            currency: "CNY",
            category_index: 1,
            entry_date: "2025-01-25",
          },
        ],
        title: "晚餐费用",
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );

    // Retry with new text
    // Note: New retry approach = soft delete old doc + create new doc
    const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "晚餐 50元" });
    const newDocId = retryRes.sourceDocumentId!;
    expect(newDocId).not.toBe(docId); // New document has different ID

    await processAllPendingTasks();

    // Old document should be soft deleted with its entries
    const oldDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, docId),
    });
    expect(oldDoc?.deletedAt).not.toBeNull();

    // Old entries remain but are now hidden because their source doc is deleted
    const entriesAfterRetry = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, docId),
    });
    // Entries are not soft-deleted, just linked to deleted source doc
    expect(entriesAfterRetry.length).toBe(1);
    expect(entriesAfterRetry[0].itemName).toBe("午餐");
    expect(entriesAfterRetry[0].deletedAt).toBeNull(); // Entry itself is not deleted

    // New document should have new active entries
    const newEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, newDocId),
    });
    const activeNewEntries = newEntries.filter((e) => !e.deletedAt);
    expect(activeNewEntries.length).toBe(1);
    expect(activeNewEntries[0].itemName).toBe("晚餐");
    expect(activeNewEntries[0].amount).toBe("50.00");
  });
});
