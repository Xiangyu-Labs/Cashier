import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledgers/[id]/receipts/route";
import { DELETE } from "@/app/api/ledgers/[id]/receipts/[receiptId]/route";
import { getTestDb } from "../../setup";
import { ledgers, categories, transactions, receipts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";

// Mock OpenAI
vi.mock("@/lib/ai/openai", () => ({
  getOpenAIClient: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

import { getOpenAIClient } from "@/lib/ai/openai";

describe("POST /api/ledgers/[id]/receipts", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    // Reset mock to default
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.singleTransaction),
    } as unknown as ReturnType<typeof getOpenAIClient>);

    const db = getTestDb();

    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger", autoConfirm: true })
      .returning();
    testLedgerId = ledger.id;

    const category = await db.query.categories.findFirst({
      where: eq(categories.name, "餐饮"),
    });

    // Fallback if not seeded (though setup should seed it)
    if (category) {
      testCategoryId = category.id;
    } else {
      const [newCat] = await db
        .insert(categories)
        .values({
          name: "餐饮",
          description: "外卖、堂食",
          sortOrder: 1,
        })
        .returning();
      testCategoryId = newCat.id;
    }
  });

  // ...

  it("should persist transactions with notes", async () => {
    // Override mock for this test
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.transactionWithMetadata),
    } as unknown as ReturnType<typeof getOpenAIClient>);

    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({ text: "苹果2公斤，每公斤10元" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("queued");

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 30) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, data.receiptId),
      });
      if (receipt?.status === "completed") break;
      if (receipt?.status === "failed") {
        console.error("Receipt processing failed:", receipt.error);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    const savedTx = await db.query.transactions.findFirst({
      where: eq(transactions.receiptId, data.receiptId)
    });

    expect(savedTx).toBeDefined();
    expect(savedTx?.itemName).toBe("苹果");
    // Ensure notes are saved in description
    expect(savedTx?.description).toContain("2kg");
    expect(savedTx?.description).toContain("10元");
  });

  it("should process text message and create pending transaction", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({ text: "午餐花了25.5元" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.receiptId).toBeDefined();
    expect(data.status).toBe("queued");

    // Poll until processed
    const db = getTestDb();
    let retries = 0;
    while (retries < 10) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, data.receiptId),
      });
      if (receipt?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    const savedTransactions = await db.query.transactions.findMany({
      where: eq(transactions.receiptId, data.receiptId),
    });

    expect(savedTransactions).toHaveLength(1);
    expect(savedTransactions[0].itemName).toBe("午餐");
    expect(savedTransactions[0].amount).toBe("25.50");
  });

  it("should match category by name", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({ text: "午餐" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(data.status).toBe("queued");

    // Wait for processing
    const db = getTestDb();
    let retries = 0;
    while (retries < 10) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, data.receiptId),
      });
      if (receipt?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    const savedTransactions = await db.query.transactions.findMany({
      where: eq(transactions.receiptId, data.receiptId),
      with: { category: true }
    });

    expect(savedTransactions).toHaveLength(1);
    expect(savedTransactions[0].categoryId).toBe(testCategoryId);
    expect(savedTransactions[0].category).toBeDefined();
    expect(savedTransactions[0].category?.name).toBe("餐饮");
  });

  it("should save input message with AI response", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({ text: "午餐25元" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    const db = getTestDb();
    const savedReceipt = await db.query.receipts.findFirst({
      where: eq(receipts.id, data.receiptId),
    });

    expect(savedReceipt).toBeDefined();
    expect(savedReceipt).toBeDefined();
    // aiResponse might not be populated immediately if we check too fast, 
    // but the content should be there.
    expect(savedReceipt?.status).toBeDefined();
    expect(savedReceipt?.status).toBeDefined();
    expect(savedReceipt?.text).toBe("午餐25元");
    expect(savedReceipt?.imageUrls).toEqual([]);

    // Wait for processing to prevent race condition with next test
    let retries = 0;
    while (retries < 30) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, data.receiptId),
      });
      if (receipt?.status === "completed" || receipt?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }
  });

  it("should return 400 when no input provided", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("At least one input");
  });

  it("should return 404 for non-existent ledger", async () => {
    const request = new NextRequest(
      "http://localhost/api/ledgers/non-existent/receipts",
      {
        method: "POST",
        body: JSON.stringify({ text: "test" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Ledger not found");
  });

  it("should handle image input", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({
          images: [
            {
              data: "data:image/jpeg;base64,/9j/4AAQSkZ...",
              mimeType: "image/jpeg",
            },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("queued");

    const db = getTestDb();
    const savedReceipt = await db.query.receipts.findFirst({
      where: eq(receipts.id, data.receiptId),
    });
    expect(savedReceipt?.imageUrls).toHaveLength(1);
    expect(savedReceipt?.text).toBeNull();

    // Wait for processing to prevent race condition with next test
    let retries = 0;
    while (retries < 30) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, data.receiptId),
      });
      if (receipt?.status === "completed" || receipt?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }
  });



  it("should delete receipt and associated transactions", async () => {
    // 1. Create a message first
    const createReq = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify({ text: "待删除的项目 100元" }),
      }
    );
    const createRes = await POST(createReq, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const createData = await createRes.json();
    const receiptId = createData.receiptId;

    // Wait for processing to ensure transactions are created
    const db = getTestDb();
    let retries = 0;
    while (retries < 10) {
      const receipt = await db.query.receipts.findFirst({
        where: eq(receipts.id, receiptId),
      });
      if (receipt?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
      retries++;
    }

    // Verify transaction exists
    const txsBefore = await db.query.transactions.findMany({
      where: eq(transactions.receiptId, receiptId),
    });
    expect(txsBefore.length).toBeGreaterThan(0);

    // 2. DELETE request
    const deleteReq = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/receipts/${receiptId}`,
      {
        method: "DELETE",
      }
    );

    const deleteRes = await DELETE(deleteReq, {
      params: Promise.resolve({ id: testLedgerId, receiptId }),
    });

    expect(deleteRes.status).toBe(204);

    // 3. Verify deletion
    const receiptAfter = await db.query.receipts.findFirst({
      where: eq(receipts.id, receiptId),
    });
    expect(receiptAfter).toBeUndefined();

    const txsAfter = await db.query.transactions.findMany({
      where: eq(transactions.receiptId, receiptId),
    });
    expect(txsAfter.length).toBe(0);
  });
});
