import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledgers/[id]/messages/route";
import { getTestDb } from "../../setup";
import { ledgers, categories, transactions, inputMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MOCK_RESPONSES } from "../../helpers/mocks/gemini";

// Mock Gemini
vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({
    generateContent: vi.fn().mockResolvedValue(MOCK_RESPONSES.singleTransaction),
  }),
}));

describe("POST /api/ledgers/[id]/messages", () => {
  let testLedgerId: string;
  let testCategoryId: string;

  beforeEach(async () => {
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
    // Content is now stored as plain text, not JSON
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

  it("should handle mixed input (text + image)", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "这是小票",
          images: [
            {
              data: "data:image/png;base64,iVBORw0KGgo...",
              mimeType: "image/png",
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

    // Mixed input should be stored as "text" contentType (fallback)
    const db = getTestDb();
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });
    // The API stores mixed as "text" due to the ternary in the route
    expect(savedMessage?.contentType).toBe("text");

    // Transaction should have sourceType "mixed"
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.inputMessageId, data.messageId),
    });
    expect(tx?.sourceType).toBe("mixed");
  });

  it("should persist transactions to database", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text: "午餐" }),
      }
    );

    await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });

    const db = getTestDb();
    const allTransactions = await db.query.transactions.findMany({
      where: eq(transactions.ledgerId, testLedgerId),
    });

    expect(allTransactions).toHaveLength(1);
    expect(allTransactions[0].ledgerId).toBe(testLedgerId);
    expect(allTransactions[0].status).toBe("pending");
  });

  it("should store image content as data URL usable for img src", async () => {
    const imageDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          images: [
            {
              data: imageDataUrl,
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

    const db = getTestDb();
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });

    // The content should be directly usable as img src (data URL)
    // NOT a JSON string like '{"images":[...]}'
    expect(savedMessage?.contentType).toBe("image");
    expect(savedMessage?.content).toBe(imageDataUrl);
    expect(savedMessage?.content.startsWith("data:image/")).toBe(true);
  });

  it("should store text content directly (not JSON wrapped)", async () => {
    const textContent = "午餐花了25.5元";
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ text: textContent }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);

    const db = getTestDb();
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });

    // The content should be the text directly, not JSON
    expect(savedMessage?.contentType).toBe("text");
    expect(savedMessage?.content).toBe(textContent);
  });

  it("should store multiple images as JSON array", async () => {
    const image1 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    const image2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE";
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          images: [
            { data: image1, mimeType: "image/jpeg" },
            { data: image2, mimeType: "image/png" },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);

    const db = getTestDb();
    const savedMessage = await db.query.inputMessages.findFirst({
      where: eq(inputMessages.id, data.messageId),
    });

    // Multiple images should be stored as JSON array of data URLs
    expect(savedMessage?.contentType).toBe("image");
    const images = JSON.parse(savedMessage!.content);
    expect(Array.isArray(images)).toBe(true);
    expect(images).toHaveLength(2);
    expect(images[0]).toBe(image1);
    expect(images[1]).toBe(image2);
  });
});
