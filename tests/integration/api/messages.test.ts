import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledgers/[id]/messages/route";
import { getTestDb } from "../../setup";
import { ledgers, categories, transactions, inputMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/gemini";

// Mock Gemini
vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

import { getGeminiClient } from "@/lib/ai/gemini";

describe("POST /api/ledgers/[id]/messages", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    // Reset mock to default
    vi.mocked(getGeminiClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.singleTransaction),
    } as any);

    const db = getTestDb();

    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger" })
      .returning();
    testLedgerId = ledger.id;

    const [category] = await db
      .insert(categories)
      .values({
        ledgerId: testLedgerId,
        name: "餐饮",
        description: "外卖、堂食",
        sortOrder: 1,
      })
      .returning();
    testCategoryId = category.id;
  });

  it("should process text message and create pending transaction", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
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
    expect(data.messageId).toBeDefined();
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].status).toBe("pending");
    expect(data.transactions[0].itemName).toBe("午餐");
  });

  it("should match category by name", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text: "午餐" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(data.transactions[0].categoryId).toBe(testCategoryId);
    expect(data.transactions[0].category).toBeDefined();
    expect(data.transactions[0].category.name).toBe("餐饮");
  });

  it("should save input message with AI response", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
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
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });

    expect(savedMessage).toBeDefined();
    expect(savedMessage?.aiResponse).toBeDefined();
    expect(savedMessage?.contentType).toBe("text");
    expect(savedMessage!.content).toBe("午餐25元");
  });

  it("should return 400 when no input provided", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
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
      "http://localhost/api/ledgers/non-existent/messages",
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
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
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
    expect(data.transactions).toHaveLength(1);

    const db = getTestDb();
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });
    expect(savedMessage?.contentType).toBe("image");
  });

  it("should persist transactions with metadata", async () => {
    // Override mock for this test
    vi.mocked(getGeminiClient).mockReturnValue({
      generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.transactionWithMetadata),
    } as any);

    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
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
    
    const db = getTestDb();
    const savedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, data.transactions[0].id)
    });

    expect(savedTx).toBeDefined();
    expect(savedTx?.itemName).toBe("苹果");
    // Ensure metadata is saved as JSON
    const metadata = savedTx?.metadata as any;
    expect(metadata).toEqual({
      quantity: 2,
      unitPrice: 10,
      unit: "kg",
      originalName: "红富士苹果"
    });
  });
});
