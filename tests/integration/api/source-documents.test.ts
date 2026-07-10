import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSourceDocumentAction,
  deleteSourceDocumentAction,
  getPendingSourceDocumentsAction,
  getSourceDocumentCollectionAction,
  getSourceDocumentsAction,
} from "@/modules/source-document/actions";
import { getTestDb } from "../../setup";
import {
  entryCategories as categories,
  ledgerEntries,
  sourceDocuments,
  ledgers,
} from "@/persistence";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { createMultiStageMock } from "../../helpers/mocks/openai";

// Mock OpenAI
vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: vi.fn(),
  resetOpenAIClient: vi.fn(),
}));

import { getOpenAIClient } from "@/lib/ai/openai-client";
import { initializeDefaultTaskRuntime, resetTaskRuntime } from "@/lib/tasks/runtime";
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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  beforeEach(async () => {
    // Reset mock to use multi-stage mock by default
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock() as unknown as ReturnType<typeof getOpenAIClient>
    );

    resetTaskRuntime();
    await initializeDefaultTaskRuntime();

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
            amount: 20,
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

    expect(result.status).toBe("queued");

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
    expect(result.status).toBe("queued");

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
    expect(result.status).toBe("queued");

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
    expect(savedDoc?.status).toBeDefined();
    expect(savedDoc?.text).toBe("午餐25元");
    expect(savedDoc?.imageUrls).toEqual([]);

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

  it("should handle image input", async () => {
    const result = await createSourceDocumentAction(testLedgerId, {
      images: [
        {
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+xDoAAAAASUVORK5CYII=",
          mimeType: "image/png",
        },
      ],
    });

    expect(result.status).toBe("queued");

    const db = getTestDb();
    const savedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });
    expect(savedDoc?.imageUrls).toHaveLength(1);
    expect(savedDoc?.text).toBeNull(); // text optional in input, but in action we pass null if undefined

    // Process tasks to ensure cleanup
    await processAllPendingTasks();
  });

  it("should persist originalImages as metadata.originalImageUrls", async () => {
    const result = await createSourceDocumentAction(testLedgerId, {
      text: "带原图的单据",
      originalImages: [
        {
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+xDoAAAAASUVORK5CYII=",
          mimeType: "image/png",
        },
      ],
    });

    const db = getTestDb();
    const savedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });

    expect(savedDoc).toBeDefined();
    if (savedDoc == null) {
      throw new Error("Expected source document to be saved");
    }
    expect(isRecord(savedDoc.metadata)).toBe(true);
    if (!isRecord(savedDoc.metadata)) {
      throw new Error("Expected source document metadata to be an object");
    }
    const originalImageUrls = savedDoc.metadata.originalImageUrls;
    expect(Array.isArray(originalImageUrls)).toBe(true);
    if (!Array.isArray(originalImageUrls)) {
      throw new Error("Expected metadata.originalImageUrls to be an array");
    }
    expect(originalImageUrls).toHaveLength(1);
    const firstOriginalImageUrl = firstItem(
      originalImageUrls,
      "Expected one original image url in metadata"
    );
    expect(typeof firstOriginalImageUrl).toBe("string");
    if (typeof firstOriginalImageUrl !== "string") {
      throw new Error("Expected original image url to be a string");
    }
    expect(firstOriginalImageUrl).toMatch(/^\/api\/uploads\//);
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
    expect(docAfter?.status).toBe("deleted");
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
          text: "Lunch",
          status: "completed",
          imageUrls: [],
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
          text: "full raw text",
          status: "completed",
          imageUrls: ["/api/uploads/source-documents/testLedger/doc/image.jpg"],
          metadata: {
            visionDescription: "sensitive debug text",
            merchant: "Test Merchant",
          },
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

    const result = await getSourceDocumentsAction(testLedgerId, {
      includeEntries: true,
    });
    const item = result.items.find((sourceDocument) => sourceDocument.id === doc.id);

    expect(item).toBeDefined();
    if (item == null) {
      throw new Error("Expected source document page item to be returned");
    }

    expect(item.text).toBeNull();
    expect(item.imageUrls).toEqual([]);
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
          text: "January expense",
          status: "completed",
          imageUrls: [],
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
          text: "March expense",
          status: "completed",
          imageUrls: [],
          entryDate: "2024-03-15", // Entry date in March
          createdAt: new Date("2024-01-01"), // Created in January
        })
        .returning(),
      "Expected March source document to be created"
    );

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

  it("should return stripped list items from getSourceDocumentCollectionAction", async () => {
    const db = getTestDb();

    const doc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          title: "Receipt",
          text: "full raw text",
          status: "completed",
          imageUrls: ["/api/uploads/source-documents/testLedger/doc/image.jpg"],
          metadata: {
            visionDescription: "sensitive debug text",
            merchant: "Test Merchant",
          },
        })
        .returning(),
      "Expected source document to be created for collection test"
    );

    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      sourceDocumentId: doc.id,
      amount: "88.00",
      currency: "CNY",
      itemName: "Collection item",
      categoryId: testCategoryId,
    });

    const result = await getSourceDocumentCollectionAction(testLedgerId, { limit: 1000 });
    const item = result.items.find((sourceDocument) => sourceDocument.id === doc.id);

    expect(item).toBeDefined();
    if (item == null) {
      throw new Error("Expected source document collection item to be returned");
    }

    expect(item.text).toBeNull();
    expect(item.imageUrls).toEqual([]);
    expect(item.metadata).toEqual({});
    expect(item.hasImages).toBe(true);
    expect(item.ledgerEntries).toHaveLength(1);
  });

  it("should return stripped list items inside pending source document groups", async () => {
    const db = getTestDb();

    const doc = firstItem(
      await db
        .insert(sourceDocuments)
        .values({
          ledgerId: testLedgerId,
          title: "Anomaly doc",
          text: "raw anomaly text",
          status: "anomaly",
          imageUrls: ["/api/uploads/source-documents/testLedger/doc/anomaly.jpg"],
          metadata: {
            visionDescription: "internal anomaly debug text",
            merchant: "Test Merchant",
          },
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

    const result = await getPendingSourceDocumentsAction(testLedgerId);
    const group = result.groups.anomaly.find((entry) => entry.sourceDocument.id === doc.id);

    expect(group).toBeDefined();
    if (group == null) {
      throw new Error("Expected anomaly group entry to be returned");
    }

    expect(group.sourceDocument.text).toBeNull();
    expect(group.sourceDocument.imageUrls).toEqual([]);
    expect(group.sourceDocument.metadata).toEqual({});
    expect(group.sourceDocument.hasImages).toBe(true);
    expect(group.ledgerEntries).toHaveLength(1);
    expect(result.stats.anomalyCount).toBeGreaterThan(0);
  });
});
