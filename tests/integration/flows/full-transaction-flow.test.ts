import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createLedger, GET as getLedgers } from "@/app/api/ledgers/route";
import { GET as getLedger, DELETE as deleteLedger, PATCH as updateLedger } from "@/app/api/ledgers/[id]/route";
import { POST as sendMessage } from "@/app/api/ledgers/[id]/receipts/route";
import { GET as getTransactions } from "@/app/api/ledgers/[id]/transactions/route";
import { GET as getCategories } from "@/app/api/ledgers/[id]/categories/route";
import { getTestDb } from "../../setup";
import { receipts, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";
import { Category, Transaction } from "@/types/api";

// Mock OpenAI for all E2E tests
vi.mock("@/lib/ai/openai", () => ({
  getOpenAIClient: () => ({
    generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.multipleTransactions),
  }),
}));

describe("Full Transaction Flow", () => {
  it("should complete: create ledger -> verify categories -> send message -> verify transactions", async () => {
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

    // Enable auto-confirm for testing transaction creation flow
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
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/categories`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const fetchedCategories = (await catResponse.json()) as Category[];
    expect(fetchedCategories.length).toBeGreaterThanOrEqual(2);
    expect(fetchedCategories.map((c) => c.name)).toContain("餐饮");

    // Step 3: Send a message to create transactions
    const messageRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/receipts`,
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
    expect(messageResult.receiptId).toBeDefined();
    expect(messageResult.status).toBe("queued");

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.receipts.findFirst({
        where: eq(receipts.id, messageResult.receiptId),
      });
      if (message?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Step 4: Verify transactions are persisted
    // Fetch transactions directly from API or DB
    const transactionsRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/transactions`
    );

    const transactionsResponse = await getTransactions(transactionsRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const responseBody = await transactionsResponse.json();
    const allTransactions = responseBody.items as Transaction[];

    expect(allTransactions).toHaveLength(2);
    expect(allTransactions.map((t) => t.itemName)).toContain("牛奶");
    expect(allTransactions.map((t) => t.itemName)).toContain("面包");

    // Step 5: Verify input message was saved with AI response
    const savedMessage = await db.query.receipts.findFirst({
      where: eq(receipts.id, messageResult.receiptId),
    });

    expect(savedMessage).toBeDefined();
    expect(savedMessage?.aiResponse).toBeDefined();
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

    // Create transactions via message
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({ text: "test" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.receipts.findFirst({
        where: eq(receipts.id, messageResult.receiptId),
      });
      if (message?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Verify data exists
    let txCount = await db.query.transactions.findMany({
      where: eq(transactions.ledgerId, ledger.id),
    });
    expect(txCount.length).toBeGreaterThan(0);

    // Delete ledger
    const deleteResponse = await deleteLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    expect(deleteResponse.status).toBe(200);

    // Verify all related data is deleted
    txCount = await db.query.transactions.findMany({
      where: eq(transactions.ledgerId, ledger.id),
    });
    expect(txCount).toHaveLength(0);

    const messages = await db.query.receipts.findMany({
      where: eq(receipts.ledgerId, ledger.id),
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

  it("should correctly associate transactions with categories", async () => {
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
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/categories`),
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
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({ text: "超市购物：牛奶15元，面包8元" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.receipts.findFirst({
        where: eq(receipts.id, messageResult.receiptId),
      });
      if (message?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Verify processing completion
    const finalMessage = await db.query.receipts.findFirst({
      where: eq(receipts.id, messageResult.receiptId),
    });

    if (finalMessage?.status !== "completed") {
      console.error("Message processing failed:", {
        status: finalMessage?.status,
        error: finalMessage?.error,
        aiResponse: finalMessage?.aiResponse
      });
    }
    expect(finalMessage?.status).toBe("completed");

    // Get transactions and verify category associations
    const transactionsResponse = await getTransactions(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/transactions`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const responseBody = await transactionsResponse.json();
    const allTransactions = responseBody.items as Transaction[];

    const milkTx = allTransactions.find((t) => t.itemName === "牛奶");
    const breadTx = allTransactions.find((t) => t.itemName === "面包");

    expect(milkTx).toBeDefined();
    expect(milkTx).toBeDefined();
    expect(breadTx).toBeDefined();

    // 牛奶 should be associated with 日用
    expect(milkTx!.categoryId).toBe(dailyCategory!.id);
    expect(milkTx!.category?.name).toBe("日用");

    // 面包 should be associated with 餐饮
    expect(breadTx!.categoryId).toBe(foodCategory!.id);
    expect(breadTx!.category?.name).toBe("餐饮");
  });
});
