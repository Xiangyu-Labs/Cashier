import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createLedger, GET as getLedgers } from "@/app/api/ledgers/route";
import { GET as getLedger, DELETE as deleteLedger } from "@/app/api/ledgers/[id]/route";
import { POST as sendMessage } from "@/app/api/ledgers/[id]/messages/route";
import { GET as getTransactions } from "@/app/api/ledgers/[id]/transactions/route";
import { GET as getCategories } from "@/app/api/ledgers/[id]/categories/route";
import { getTestDb } from "../../setup";
import { inputMessages, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";

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
      body: JSON.stringify({ name: "E2E Test Ledger", language: "zh-CN" }),
    });

    const createResponse = await createLedger(createRequest);
    const ledger = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(ledger.id).toBeDefined();
    expect(ledger.name).toBe("E2E Test Ledger");

    // Step 2: Verify ledger was created with categories
    const getResponse = await getLedger(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const ledgerWithCategories = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(ledgerWithCategories.categories.length).toBeGreaterThan(0);
    expect(ledgerWithCategories.categories.map((c: any) => c.name)).toContain("餐饮");
    expect(ledgerWithCategories.categories.map((c: any) => c.name)).toContain("交通");

    // Step 3: Send a message to create transactions
    const messageRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/messages`,
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
    expect(messageResult.messageId).toBeDefined();
    expect(messageResult.status).toBe("queued");

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, messageResult.messageId),
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
    const allTransactions = await transactionsResponse.json();

    expect(allTransactions).toHaveLength(2);
    expect(allTransactions.every((t: any) => t.status === "pending")).toBe(true);
    expect(allTransactions.map((t: any) => t.itemName)).toContain("牛奶");
    expect(allTransactions.map((t: any) => t.itemName)).toContain("面包");

    // Step 5: Verify input message was saved with AI response
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, messageResult.messageId),
    });

    expect(savedMessage).toBeDefined();
    expect(savedMessage?.aiResponse).toBeDefined();
    expect(savedMessage?.content).toContain("超市购物");
  });

  it("should filter transactions by status", async () => {
    // Create ledger
    const createRequest = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "Filter Test Ledger" }),
    });
    const ledger = await (await createLedger(createRequest)).json();

    // Create pending transactions via message
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: "test expense" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, messageResult.messageId),
      });
      if (message?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Filter by pending status
    const pendingRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/transactions?status=pending`
    );
    const pendingResponse = await getTransactions(pendingRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const pendingTransactions = await pendingResponse.json();

    expect(pendingTransactions.length).toBeGreaterThan(0);
    expect(pendingTransactions.every((t: any) => t.status === "pending")).toBe(true);

    // Filter by confirmed status (should be empty)
    const confirmedRequest = new NextRequest(
      `http://localhost/api/ledgers/${ledger.id}/transactions?status=confirmed`
    );
    const confirmedResponse = await getTransactions(confirmedRequest, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const confirmedTransactions = await confirmedResponse.json();

    expect(confirmedTransactions).toHaveLength(0);
  });

  it("should cascade delete all related data when ledger is deleted", async () => {
    // Create ledger
    const createRequest = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "Delete Test Ledger" }),
    });
    const ledger = await (await createLedger(createRequest)).json();

    // Create transactions via message
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/messages`, {
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
      const message = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, messageResult.messageId),
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

    const messages = await db.query.inputMessages.findMany({
      where: eq(inputMessages.ledgerId, ledger.id),
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

    // Get categories to find 餐饮 and 日用品
    const categoriesResponse = await getCategories(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/categories`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const allCategories = await categoriesResponse.json();

    const foodCategory = allCategories.find((c: any) => c.name === "餐饮");
    const dailyCategory = allCategories.find((c: any) => c.name === "日用品");

    expect(foodCategory).toBeDefined();
    expect(dailyCategory).toBeDefined();

    // Send message (mock returns 牛奶 -> 日用品, 面包 -> 餐饮)
    const messageResponse = await sendMessage(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: "购物清单" }),
      }),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const messageResult = await messageResponse.json();

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 20) {
      const message = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.id, messageResult.messageId),
      });
      if (message?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Get transactions and verify category associations
    const transactionsResponse = await getTransactions(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}/transactions`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const allTransactions = await transactionsResponse.json();

    const milkTx = allTransactions.find((t: any) => t.itemName === "牛奶");
    const breadTx = allTransactions.find((t: any) => t.itemName === "面包");

    expect(milkTx).toBeDefined();
    expect(breadTx).toBeDefined();

    // 牛奶 should be associated with 日用品
    expect(milkTx.categoryId).toBe(dailyCategory.id);
    expect(milkTx.category?.name).toBe("日用品");

    // 面包 should be associated with 餐饮
    expect(breadTx.categoryId).toBe(foodCategory.id);
    expect(breadTx.category?.name).toBe("餐饮");
  });
});
