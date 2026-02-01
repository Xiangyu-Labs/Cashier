import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSourceDocumentAction, deleteSourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import { entryCategories as categories, ledgerEntries, sourceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";

// Mock OpenAI
vi.mock("@/features/ai/server/services/openai", () => ({
  getOpenAIClient: vi.fn(),
}));

import { getOpenAIClient } from "@/features/ai/server/services/openai";
import { processAllPendingTasks } from "../../helpers/processing";

describe("SourceDocument Actions", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    // Reset mock to default
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({ content: MOCK_RESPONSES.singleEntry }),
    } as unknown as ReturnType<typeof getOpenAIClient>);

    const db = getTestDb();

    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;

    const category = await db.query.entryCategories.findFirst({
      where: eq(categories.name, "餐饮"),
    });

    if (category) {
      testCategoryId = category.id;
    } else {
      const [newCat] = await db
        .insert(categories)
        .values({
          name: "餐饮",
          description: "外卖、堂食",
          sortOrder: 1,
          ledgerId: testLedgerId,
        })
        .returning();
      testCategoryId = newCat.id;
    }

    // Ensure '水果' category exists for the notes test
    const fruitCategory = await db.query.entryCategories.findFirst({
      where: eq(categories.name, "水果"),
    });
    if (!fruitCategory) {
      await db.insert(categories).values({
        name: "水果",
        description: "Fresh Fruit",
        sortOrder: 2,
        ledgerId: testLedgerId,
      });
    }
  });

  it("should persist ledger entries with notes", async () => {
    // Override mock for this test
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({ content: MOCK_RESPONSES.entryWithMetadata }),
    } as unknown as ReturnType<typeof getOpenAIClient>);

    const result = await createSourceDocumentAction(testLedgerId, { text: "苹果2公斤，每公斤10元" });

    expect(result.success).toBe(true);
    expect(result.status).toBe("queued");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId!)
    });

    expect(savedEntry).toBeDefined();
    expect(savedEntry?.itemName).toBe("苹果");
    // Ensure notes are saved in description
    expect(savedEntry?.description).toContain("2kg");
    expect(savedEntry?.description).toContain("10元");
  });

  it("should process text message and create ledger entry", async () => {
    const result = await createSourceDocumentAction(testLedgerId, { text: "午餐花了25.5元" });
    expect(result.success).toBe(true);
    expect(result.sourceDocumentId).toBeDefined();
    expect(result.status).toBe("queued");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId!),
    });

    expect(savedEntries).toHaveLength(1);
    expect(savedEntries[0].itemName).toBe("午餐");
    expect(savedEntries[0].amount).toBe("25.50");
  });

  it("should match category by name", async () => {
    const result = await createSourceDocumentAction(testLedgerId, { text: "午餐" });
    expect(result.status).toBe("queued");

    // Process
    await processAllPendingTasks();

    const db = getTestDb();
    const savedEntries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, result.sourceDocumentId!),
      with: { category: true }
    });

    expect(savedEntries).toHaveLength(1);
    expect(savedEntries[0].categoryId).toBe(testCategoryId);
    expect(savedEntries[0].category).toBeDefined();
    expect(savedEntries[0].category?.name).toBe("餐饮");
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
    const result = await createSourceDocumentAction(testLedgerId, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("At least one input");
  });

  it("should return error for non-existent ledger", async () => {
    const result = await createSourceDocumentAction("00000000-0000-0000-0000-000000000099", { text: "foo" });
    // requireLedgerAccess returns 404 response object via helper?
    // Wait, helper implementation returns { error: NextResponse }.
    // Action catches it?
    // In action:
    // const { scope, ledger, error } = await requireLedgerAccess(ledgerId);
    // if (error || !scope) throw new Error("Unauthorized or Ledger not found");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unauthorized or Ledger not found");
  });

  it("should handle image input", async () => {
    const result = await createSourceDocumentAction(testLedgerId, {
      images: [
        {
          data: "data:image/jpeg;base64,/9j/4AAQSkZ...",
          mimeType: "image/jpeg",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("queued");

    const db = getTestDb();
    const savedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId!),
    });
    expect(savedDoc?.imageUrls).toHaveLength(1);
    expect(savedDoc?.text).toBeNull(); // text optional in input, but in action we pass null if undefined

    // Process tasks to ensure cleanup
    await processAllPendingTasks();
  });

  it("should delete source document and associated ledger entries", async () => {
    // 1. Create a message first
    const createRes = await createSourceDocumentAction(testLedgerId, { text: "待删除的项目 100元" });
    const sourceDocumentId = createRes.sourceDocumentId!;

    // Process
    await processAllPendingTasks();

    // Verify ledger entry exists
    const db = getTestDb();
    const entriesBefore = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
    });
    expect(entriesBefore.length).toBeGreaterThan(0);

    // 2. DELETE request
    const deleteRes = await deleteSourceDocumentAction(testLedgerId, sourceDocumentId);
    expect(deleteRes.success).toBe(true);

    // 3. Verify deletion
    const docAfter = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(docAfter).toBeUndefined();

    const entriesAfter = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
    });
    expect(entriesAfter.length).toBe(0);
  });
});
