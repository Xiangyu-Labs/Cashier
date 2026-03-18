import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories, taskRuns, users } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";

const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

// Mock flowEngine before importing actions
vi.mock("@/lib/flow", () => ({
  flowEngine: {
    submit: vi.fn().mockResolvedValue("mock-task-id"),
    cancel: vi.fn(),
    register: vi.fn(),
    getStatus: vi.fn(),
  },
}));

import { flowEngine } from "@/lib/flow";
import {
  submitAutoCategorizeAction,
  submitBatchCategorizeAction,
} from "@/features/ledger/server/actions/categorize";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("submitAutoCategorizeAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();

    // Create ledger owned by test user
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("returns { submittedCount: 0, skippedCount: 0 } when no entries exist", async () => {
    // Add a category so we don't hit "No categories available"
    const db = getTestDb();
    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const result = await submitAutoCategorizeAction(ledgerId);
    expect(result).toEqual({ submittedCount: 0, skippedCount: 0 });
    expect(flowEngine.submit).not.toHaveBeenCalled();
  });

  it("throws 'No categories available' when ledger has no categories", async () => {
    const db = getTestDb();
    // Create a source doc and entry
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "午餐",
      amount: "25.00",
      currency: "CNY",
    });

    await expect(submitAutoCategorizeAction(ledgerId)).rejects.toThrow("No categories available");
  });

  it("submits tasks for uncategorized entries", async () => {
    const db = getTestDb();

    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "午餐花了25元",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "午餐",
        amount: "25.00",
        currency: "CNY",
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "晚餐",
        amount: "40.00",
        currency: "CNY",
      },
    ]);

    const result = await submitAutoCategorizeAction(ledgerId);
    expect(result.submittedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(flowEngine.submit).toHaveBeenCalledTimes(2);
  });

  it("skips entries that already have a category", async () => {
    const db = getTestDb();

    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    // One categorized, one not
    await db.insert(ledgerEntries).values([
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "已分类",
        amount: "10.00",
        currency: "CNY",
        categoryId: catId,
      },
      {
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "未分类",
        amount: "20.00",
        currency: "CNY",
      },
    ]);

    const result = await submitAutoCategorizeAction(ledgerId);
    // Only uncategorized entries are fetched by the action
    expect(result.submittedCount).toBe(1);
    expect(flowEngine.submit).toHaveBeenCalledTimes(1);
  });

  it("submits entries even with pending/running categorize tasks (engine handles dedup)", async () => {
    const db = getTestDb();

    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    const entryId = uuidv4();
    await db.insert(ledgerEntries).values({
      id: entryId,
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "午餐",
      amount: "25.00",
      currency: "CNY",
    });

    // Insert a pending task for this entry
    await db.insert(taskRuns).values({
      id: uuidv4(),
      type: "categorize_entry",
      title: "Categorize: 午餐",
      input: { entryId, ledgerId },
      status: "pending",
      scopeId: ledgerId,
    });

    // With deduplicationKey, action layer still submits but engine handles dedup
    const result = await submitAutoCategorizeAction(ledgerId);
    expect(result.submittedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(flowEngine.submit).toHaveBeenCalledTimes(1);
    // Verify deduplicationKey is passed
    expect(flowEngine.submit).toHaveBeenCalledWith(
      "categorize_entry",
      expect.any(Object),
      expect.objectContaining({
        deduplicationKey: `categorize:${ledgerId}:${entryId}`,
      })
    );
  });

  it("skips manual (quick entry) source documents", async () => {
    const db = getTestDb();

    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: null,
        status: "completed",
        type: "manual",
        imageUrls: [],
      })
      .returning();

    await db.insert(ledgerEntries).values({
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "手动记账",
      amount: "50.00",
      currency: "CNY",
    });

    const result = await submitAutoCategorizeAction(ledgerId);
    expect(result.submittedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(flowEngine.submit).not.toHaveBeenCalled();
  });

  it("throws 'Unauthorized' when ledger belongs to another user", async () => {
    const db = getTestDb();
    const otherLedgerId = uuidv4();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    await expect(submitAutoCategorizeAction(otherLedgerId)).rejects.toThrow("Ledger not found");
  });
});

describe("submitBatchCategorizeAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();

    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: {},
    });
  });

  it("returns { submittedCount: 0, skippedCount: 0 } for empty entryIds", async () => {
    const result = await submitBatchCategorizeAction(ledgerId, []);
    expect(result).toEqual({ submittedCount: 0, skippedCount: 0 });
    expect(flowEngine.submit).not.toHaveBeenCalled();
  });

  it("only processes specified entryIds", async () => {
    const db = getTestDb();

    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    const entry1Id = uuidv4();
    const entry2Id = uuidv4();
    await db.insert(ledgerEntries).values([
      {
        id: entry1Id,
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "午餐",
        amount: "25.00",
        currency: "CNY",
      },
      {
        id: entry2Id,
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "晚餐",
        amount: "40.00",
        currency: "CNY",
      },
    ]);

    // Only submit for entry1
    const result = await submitBatchCategorizeAction(ledgerId, [entry1Id]);
    expect(result.submittedCount).toBe(1);
    expect(flowEngine.submit).toHaveBeenCalledTimes(1);
    expect(flowEngine.submit).toHaveBeenCalledWith(
      "categorize_entry",
      expect.objectContaining({ entryId: entry1Id }),
      expect.any(Object)
    );
  });

  it("throws 'Unauthorized' when ledger belongs to another user", async () => {
    const db = getTestDb();
    const otherLedgerId = uuidv4();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    await expect(submitBatchCategorizeAction(otherLedgerId, [uuidv4()])).rejects.toThrow(
      "Ledger not found"
    );
  });

  it("submits entries even with running tasks in batch mode (engine handles dedup)", async () => {
    const db = getTestDb();

    await db.insert(entryCategories).values({
      id: uuidv4(),
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        id: uuidv4(),
        ledgerId,
        text: "test",
        status: "completed",
        type: "ai_parsed",
        imageUrls: [],
      })
      .returning();

    const entryId = uuidv4();
    await db.insert(ledgerEntries).values({
      id: entryId,
      ledgerId,
      sourceDocumentId: doc.id,
      itemName: "午餐",
      amount: "25.00",
      currency: "CNY",
    });

    // Insert a running task for this entry
    await db.insert(taskRuns).values({
      id: uuidv4(),
      type: "categorize_entry",
      title: "Categorize: 午餐",
      input: { entryId, ledgerId },
      status: "running",
      scopeId: ledgerId,
    });

    // With deduplicationKey, action layer still submits but engine handles dedup
    const result = await submitBatchCategorizeAction(ledgerId, [entryId]);
    expect(result.submittedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(flowEngine.submit).toHaveBeenCalledTimes(1);
    // Verify deduplicationKey is passed
    expect(flowEngine.submit).toHaveBeenCalledWith(
      "categorize_entry",
      expect.any(Object),
      expect.objectContaining({
        deduplicationKey: `categorize:${ledgerId}:${entryId}`,
      })
    );
  });
});
