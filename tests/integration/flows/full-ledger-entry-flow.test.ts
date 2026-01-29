import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createLedger, GET as getLedgers } from "@/app/api/ledgers/route";
import { GET as getLedger, DELETE as deleteLedger, PATCH as updateLedger } from "@/app/api/ledgers/[id]/route";
import { POST as sendMessage } from "@/app/api/ledgers/[id]/source-documents/route";
import { GET as getLedgerEntries } from "@/app/api/ledgers/[id]/ledger-entries/route";
import { GET as getCategories } from "@/app/api/ledgers/[id]/entry-categories/route";
import { getTestDb } from "../../setup";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";
import { processAllPendingTasks } from "../../helpers/processing";
import { EntryCategory as Category, LedgerEntry } from "@/types/api";

// Mock OpenAI for all E2E tests
vi.mock("@/lib/ai/openai", () => ({
  getOpenAIClient: () => ({
    generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.multipleEntries),
  }),
}));

describe("Full Ledger Entry Flow", () => {
  it("should complete: create ledger -> verify categories -> send message -> verify ledger entries", async () => {
    // Step 1: Create a new ledger
    const createRequest = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "E2E Test Ledger" }),
    });

    const createResponse = await createLedger(createRequest);
    const ledger = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(ledger.id).toBeDefined();
    expect(ledger.name).toBe("E2E Test Ledger");

    // Enable auto-confirm for testing ledger entry creation flow
    const updateRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ autoConfirm: true }),
      }
    );
    const updateResponse = await updateLedger(updateRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    expect(updateResponse.status).toBe(200);

    // Step 2: Verify ledger was created (and categories exist globally)
    const getResponse = await getLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const fetchedLedger = await getResponse.json();
    expect(getResponse.status).toBe(200);
    expect(fetchedLedger.id).toBe(ledger.id);

    // Verify categories via Categories API
    const catResponse = await getCategories(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/entry-categories`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const fetchedCategories = (await catResponse.json()) as Category[];
    expect(fetchedCategories.length).toBeGreaterThanOrEqual(2);
    expect(fetchedCategories.map((c) => c.name)).toContain("餐饮");

    // Step 3: Send a message to create ledger entries
    const messageRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/source-documents`,
      {
        method: "POST",
        body: JSON.stringify({ text: "超市购物：牛奶15元，面包8元" }),
      }
    );

    const messageResponse = await sendMessage(messageRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const messageResult = await messageResponse.json();

    expect(messageResponse.status).toBe(200);
    expect(messageResult.sourceDocumentId).toBeDefined();
    expect(messageResult.status).toBe("queued");

    // Process the tasks
    await processAllPendingTasks();

    // Verify processing completion
    const db = getTestDb();
    const message = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, messageResult.sourceDocumentId),
    });
    expect(message?.status).toBe("completed");

    // Step 4: Verify ledger entries are persisted
    // Fetch ledger entries directly from API or DB
    const ledgerEntriesRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/ledger-entries`
    );

    const ledgerEntriesResponse = await getLedgerEntries(ledgerEntriesRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const responseBody = await ledgerEntriesResponse.json();
    const allLedgerEntries = responseBody.items as LedgerEntry[];

    expect(allLedgerEntries).toHaveLength(2);
    expect(allLedgerEntries.map((t) => t.itemName)).toContain("牛奶");
    expect(allLedgerEntries.map((t) => t.itemName)).toContain("面包");

    // Step 5: Verify input message was saved with AI response
    const savedMessage = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, messageResult.sourceDocumentId),
    });

    expect(savedMessage).toBeDefined();
    expect(savedMessage?.title).toBe("超市购物");
    expect(savedMessage?.text).toContain("超市购物");
  });

  // Status filtering test removed as status field was removed from transactions table

  it("should cascade delete all related data when ledger is deleted", async () => {
    // Create ledger
    const createRequest = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "Delete Test Ledger" }),
    });
    const ledger = await (await createLedger(createRequest)).json();

    // Enable auto-confirm
    await updateLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`, {
        method: "PATCH",
        body: JSON.stringify({ autoConfirm: true }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );

    // Create ledger entries via message
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/source-documents`, {
        method: "POST",
        body: JSON.stringify({ text: "test" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Process the tasks
    await processAllPendingTasks();

    // Verify processing completion
    const db = getTestDb();
    const message = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, messageResult.sourceDocumentId),
    });
    expect(message?.status).toBe("completed");

    // Verify data exists
    let entriesCount = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.ledgerId, ledger.id),
    });
    expect(entriesCount.length).toBeGreaterThan(0);

    // Delete ledger
    const deleteResponse = await deleteLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    expect(deleteResponse.status).toBe(200);

    // Verify all related data is deleted
    entriesCount = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.ledgerId, ledger.id),
    });
    expect(entriesCount).toHaveLength(0);

    const messages = await db.query.sourceDocuments.findMany({
      where: eq(sourceDocuments.ledgerId, ledger.id),
    });
    expect(messages).toHaveLength(0);
  });

  it("should list all ledgers after creating multiple", async () => {
    // Create first ledger
    await createLedger(
      new NextRequest("http://localhost/api/ledgers", {
        method: "POST",
        body: JSON.stringify({ name: "Ledger 1" }),
      })
    );

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    // Create second ledger
    await createLedger(
      new NextRequest("http://localhost/api/ledgers", {
        method: "POST",
        body: JSON.stringify({ name: "Ledger 2" }),
      })
    );

    // Get all ledgers
    const response = await getLedgers();
    const allLedgers = await response.json();

    expect(allLedgers.length).toBeGreaterThanOrEqual(2);
    // Should be ordered by createdAt desc (newest first)
    expect(allLedgers[0].name).toBe("Ledger 2");
  });

  it("should correctly associate ledger entries with categories", async () => {
    // Create ledger with default categories
    const createRequest = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "Category Association Test" }),
    });
    const ledger = await (await createLedger(createRequest)).json();

    // Enable auto-confirm
    await updateLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`, {
        method: "PATCH",
        body: JSON.stringify({ autoConfirm: true }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );

    // Get categories to find 餐饮 and 日用品
    const categoriesResponse = await getCategories(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/entry-categories`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const allCategories = (await categoriesResponse.json()) as Category[];

    const foodCategory = allCategories.find((c) => c.name === "餐饮");
    const dailyCategory = allCategories.find((c) => c.name === "日用");

    expect(foodCategory).toBeDefined();
    expect(dailyCategory).toBeDefined();

    // Send message (mock returns 牛奶 -> 日用, 面包 -> 餐饮)
    // Send message (mock returns 牛奶 -> 日用, 面包 -> 餐饮)
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/source-documents`, {
        method: "POST",
        body: JSON.stringify({ text: "超市购物：牛奶15元，面包8元" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Process the tasks
    await processAllPendingTasks();

    // Verify processing completion
    const db = getTestDb();
    const message = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, messageResult.sourceDocumentId),
    });
    expect(message?.status).toBe("completed");

    // Verify processing completion
    const finalMessage = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, messageResult.sourceDocumentId),
    });

    if (finalMessage?.status !== "completed") {
      console.error("Message processing failed:", {
        status: finalMessage?.status,
        errorCode: finalMessage?.errorCode,
      });
    }
    expect(finalMessage?.status).toBe("completed");

    // Get ledger entries and verify category associations
    const ledgerEntriesResponse = await getLedgerEntries(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/ledger-entries`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const responseBody = await ledgerEntriesResponse.json();
    const allLedgerEntries = responseBody.items as LedgerEntry[];

    const milkEntry = allLedgerEntries.find((t) => t.itemName === "牛奶");
    const breadEntry = allLedgerEntries.find((t) => t.itemName === "面包");

    expect(milkEntry).toBeDefined();
    expect(breadEntry).toBeDefined();

    // 牛奶 should be associated with 日用
    expect(milkEntry!.categoryId).toBe(dailyCategory!.id);
    expect(milkEntry!.category?.name).toBe("日用");

    // 面包 should be associated with 餐饮
    expect(breadEntry!.categoryId).toBe(foodCategory!.id);
    expect(breadEntry!.category?.name).toBe("餐饮");
  });
});
