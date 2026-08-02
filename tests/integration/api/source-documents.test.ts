import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSourceDocumentAction,
  deleteSourceDocumentAction,
  getPendingSourceDocumentsAction,
  getSourceDocumentsAction,
} from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import {
  entryCategories as categories,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
  ledgers,
} from "@/persistence";
import { eq } from "drizzle-orm";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
  TEST_USER_ID,
} from "../../helpers/schema-setup";
import { createMultiStageMock } from "../../helpers/mocks/openai";

// Mock OpenAI
vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: vi.fn(),
  resetOpenAIClient: vi.fn(),
}));

import { getOpenAIClient } from "@/lib/ai/openai-client";
import { processAllPendingTasks } from "../../helpers/processing";

describe("SourceDocument Actions", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  function firstItem<T>(items: T[], errorMessage: string): T {
    const first = items[0];
    if (first == null) {
      throw new Error(errorMessage);
    }
    return first;
  }

  beforeEach(async () => {
    // Reset mock to use multi-stage mock by default
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock() as unknown as ReturnType<typeof getOpenAIClient>
    );

    const db = getTestDb();

    // Clean up existing ledger for TEST_USER_ID and create new one
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    const newCat = firstItem(
      await db
        .insert(categories)
        .values({
          name: "餐饮",
          description: "外卖、堂食",
          sortOrder: 1,
          ledgerId: testLedgerId,
        })
        .returning(),
      "Expected category to be created in setup"
    );
    testCategoryId = newCat.id;

    // Ensure '水果' category exists for the notes test
    await db.insert(categories).values({
      name: "水果",
      description: "Fresh Fruit",
      sortOrder: 2,
      ledgerId: testLedgerId,
    });
  });

  it("should persist ledger entries with notes", async () => {
    // Override mock for this test with custom entries
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock({
        categories: ["水果"],
        entries: [
          {
            item_name: "苹果",
            amount: "20",
            currency: "CNY",
            category_index: 1,
            notes: "2kg * 10元/kg, 红富士苹果",
          },
        ],
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );

    const result = await createSourceDocumentAction(testLedgerId, {
      text: "苹果2公斤，每公斤10元",
    });

    expect(result.revisionState).toBe("processing");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId),
    });

    expect(savedEntry).toBeDefined();
    expect(savedEntry?.itemName).toBe("苹果");
    // Ensure notes are saved in description
    expect(savedEntry?.description).toContain("2kg");
    expect(savedEntry?.description).toContain("10元");
  });

  it("should process text message and create ledger entry", async () => {
    const result = await createSourceDocumentAction(testLedgerId, { text: "午餐花了25.5元" });
    expect(result.sourceDocumentId).toBeDefined();
    expect(result.revisionState).toBe("processing");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId!),
    });

    expect(savedEntries).toHaveLength(1);
    const savedEntry = firstItem(savedEntries, "Expected one saved ledger entry");
    expect(savedEntry.itemName).toBe("午餐");
    expect(savedEntry.amount).toBe("25.50");
  });

  it("should match category by index", async () => {
    const result = await createSourceDocumentAction(testLedgerId, { text: "午餐" });
    expect(result.revisionState).toBe("processing");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId!),
      with: { category: true },
    });

    expect(savedEntries).toHaveLength(1);
    const savedEntry = firstItem(savedEntries, "Expected one categorized ledger entry");
    expect(savedEntry.categoryId).toBe(testCategoryId);
    expect(savedEntry.category).toBeDefined();
    expect(savedEntry.category?.name).toBe("餐饮");
  });

  it("should save input message with AI response", async () => {
    const result = await createSourceDocumentAction(testLedgerId, { text: "午餐25元" });

    const db = getTestDb();
    const savedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId!),
    });

    expect(savedDoc).toBeDefined();
    expect(savedDoc).not.toHaveProperty("text");
    expect(savedDoc).not.toHaveProperty("imageUrls");
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.sourceDocumentId, result.sourceDocumentId!),
    });
    expect(revision?.submittedText).toBe("午餐25元");
    expect(revision?.outcome).toBe("processing");

    // Process tasks to ensure cleanup
    await processAllPendingTasks();
  });

  it("should return error when no input provided", async () => {
    await expect(createSourceDocumentAction(testLedgerId, {})).rejects.toThrow(
      "Content (text or images) is required"
    );
  });

  it("should return error for non-existent ledger", async () => {
    await expect(
      createSourceDocumentAction("00000000-0000-0000-0000-000000000099", { text: "foo" })
    ).rejects.toThrow("Ledger not found");
  });

  it("should delete source document and associated ledger entries", async () => {
    // 1. Create a message first
    const createRes = await createSourceDocumentAction(testLedgerId, {
      text: "待删除的项目 100元",
    });
    const sourceDocumentId = createRes.sourceDocumentId!;

    // Process
    await processAllPendingTasks();

    // Verify ledger entry exists
    const db = getTestDb();
    const entriesBefore = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
    });
    expect(entriesBefore.length).toBeGreaterThan(0);

    // 2. DELETE request - deleteSourceDocumentAction returns void in new format
    await deleteSourceDocumentAction(testLedgerId, sourceDocumentId);

    // 3. Verify deletion
    const docAfter = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(docAfter).toBeDefined();
    expect(docAfter?.currentStatus).toBe("completed");
    expect(docAfter?.deletedAt).not.toBeNull();

    const entriesAfter = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
    });
    expect(entriesAfter.length).toBeGreaterThan(0);
    entriesAfter.forEach((entry) => {
      expect(entry.deletedAt).not.toBeNull();
    });
  });

  it("should fetch ledger entries with relations when requested", async () => {
    // 1. Create a doc manually to avoid background processing
    const db = getTestDb();
    const doc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          currentStatus: "completed",
        })
        .returning(),
      "Expected source document for includeEntries test"
    );
    const docId = doc.id;

    // 2. Add an entry manually
    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      sourceDocumentId: docId,
      amount: "100",
      currency: "CNY",
      itemName: "Lunch Item",
      categoryId: testCategoryId, // Fixed: Added categoryId
    });
    await activateTestSourceDocumentProjection(db, docId);

    // 3. Fetch with includeEntries
    const result = await getSourceDocumentsAction(testLedgerId, {
      includeEntries: true,
    });

    const foundDoc = result.items.find((d) => d.id === docId);
    expect(foundDoc).toBeDefined();
    if (foundDoc == null) {
      throw new Error("Expected source document to be returned");
    }
    expect(Array.isArray(foundDoc.ledgerEntries)).toBe(true);
    if (!Array.isArray(foundDoc.ledgerEntries)) {
      throw new Error("Expected source document ledgerEntries to be included");
    }
    expect(foundDoc.ledgerEntries).toHaveLength(1);
    const firstLedgerEntry = firstItem(
      foundDoc.ledgerEntries,
      "Expected one ledger entry relation on source document"
    );
    expect(firstLedgerEntry.category).toBeDefined();
    expect(firstLedgerEntry.category?.id).toBe(testCategoryId);
  });

  it("should return stripped list items from getSourceDocumentsAction", async () => {
    const db = getTestDb();

    const doc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          title: "Receipt",
          currentStatus: "completed",
        })
        .returning(),
      "Expected source document to be created for page list test"
    );

    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      sourceDocumentId: doc.id,
      amount: "88.00",
      currency: "CNY",
      itemName: "Page item",
      categoryId: testCategoryId,
    });
    await activateTestSourceDocumentProjection(db, doc.id, {
      imageUrls: ["https://example.com/receipt.jpg"],
    });

    const result = await getSourceDocumentsAction(testLedgerId, {
      includeEntries: true,
    });
    const item = result.items.find((sourceDocument) => sourceDocument.id === doc.id);

    expect(item).toBeDefined();
    if (item == null) {
      throw new Error("Expected source document page item to be returned");
    }

    expect(item.text).toBeNull();
    expect(item).not.toHaveProperty("imageUrls");
    expect(item.metadata).toEqual({});
    expect(item.hasImages).toBe(true);
    expect(item.ledgerEntries).toHaveLength(1);
  });

  it("should filter by entryDate not createdAt", async () => {
    const db = getTestDb();

    // Create doc with entryDate in Jan but created now (March)
    const docA = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          currentStatus: "completed",
          entryDate: "2024-01-15", // Entry date in January
          createdAt: new Date("2024-03-01"), // Created in March
        })
        .returning(),
      "Expected January source document to be created"
    );

    // Create doc with entryDate in March but created in January
    const docB = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          currentStatus: "completed",
          entryDate: "2024-03-15", // Entry date in March
          createdAt: new Date("2024-01-01"), // Created in January
        })
        .returning(),
      "Expected March source document to be created"
    );
    await activateTestSourceDocumentProjection(db, docA.id);
    await activateTestSourceDocumentProjection(db, docB.id);

    // Filter for January 2024
    const result = await getSourceDocumentsAction(testLedgerId, {
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    // Should only return docA (entryDate in January), not docB
    const ids = result.items.map((d) => d.id);
    expect(ids).toContain(docA.id);
    expect(ids).not.toContain(docB.id);
  });

  it("should return stripped list items inside pending source document groups", async () => {
    const db = getTestDb();

    const doc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          title: "Anomaly doc",
          currentStatus: "anomaly",
        })
        .returning(),
      "Expected source document to be created for pending group test"
    );

    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      sourceDocumentId: doc.id,
      amount: "12.34",
      currency: "CNY",
      itemName: "Pending item",
      categoryId: testCategoryId,
    });
    await activateTestSourceDocumentProjection(db, doc.id, {
      imageUrls: ["https://example.com/anomaly.jpg"],
    });

    const result = await getPendingSourceDocumentsAction(testLedgerId);
    const group = result.groups.anomaly.find((entry) => entry.sourceDocument.id === doc.id);

    expect(group).toBeDefined();
    if (group == null) {
      throw new Error("Expected anomaly group entry to be returned");
    }

    expect(group.sourceDocument.text).toBeNull();
    expect(group.sourceDocument).not.toHaveProperty("imageUrls");
    expect(group.sourceDocument.metadata).toEqual({});
    expect(group.sourceDocument.hasImages).toBe(true);
    expect(group.ledgerEntries).toHaveLength(0);
    expect(result.stats.anomalyCount).toBeGreaterThan(0);
  });
});
