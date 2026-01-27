import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/ledgers/[id]/transactions/route";
import { getTestDb } from "../../setup";
import { ledgers, categories, transactions, inputMessages } from "@/lib/db/schema";

describe("GET /api/ledgers/[id]/transactions", () => {
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
        sortOrder: 1,
      })
      .returning();
    testCategoryId = category.id;
  });

  it("should return empty array when no transactions exist", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return transactions with category relation", async () => {
    const db = getTestDb();
    await db.insert(transactions).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      amount: "25.50",
      itemName: "午餐",
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/ledgers/${testLedgerId}/transactions`
      ),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].itemName).toBe("午餐");
    expect(data[0].category.name).toBe("餐饮");
  });

  // Removed status filtering tests as status is removed from transactions

  it("should filter by categoryId", async () => {
    const db = getTestDb();
    const [otherCategory] = await db
      .insert(categories)
      .values({ ledgerId: testLedgerId, name: "交通", sortOrder: 2 })
      .returning();

    await db.insert(transactions).values([
      { ledgerId: testLedgerId, categoryId: testCategoryId, amount: "10", itemName: "餐饮交易" },
      { ledgerId: testLedgerId, categoryId: otherCategory.id, amount: "20", itemName: "交通交易" },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?categoryId=${testCategoryId}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].itemName).toBe("餐饮交易");
  });

  it("should respect limit parameter", async () => {
    const db = getTestDb();
    await db.insert(transactions).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Item 1" },
      { ledgerId: testLedgerId, amount: "20", itemName: "Item 2" },
      { ledgerId: testLedgerId, amount: "30", itemName: "Item 3" },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?limit=2`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(2);
  });

  it("should respect offset parameter", async () => {
    const db = getTestDb();
    // Insert with delays to ensure ordering
    await db.insert(transactions).values({ ledgerId: testLedgerId, amount: "10", itemName: "Oldest" });
    await new Promise((r) => setTimeout(r, 10));
    await db.insert(transactions).values({ ledgerId: testLedgerId, amount: "20", itemName: "Middle" });
    await new Promise((r) => setTimeout(r, 10));
    await db.insert(transactions).values({ ledgerId: testLedgerId, amount: "30", itemName: "Newest" });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?offset=1&limit=1`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].itemName).toBe("Middle");
  });

  // Removed invalid status test

  it("should return 400 for invalid categoryId", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?categoryId=not-a-uuid`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return transactions with inputMessage relation when linked", async () => {
    const db = getTestDb();

    // Create an input message
    const [inputMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId: testLedgerId,
        text: "午餐花了25.5元",
        aiResponse: JSON.stringify({ transactions: [{ item_name: "午餐", amount: 25.5 }] }),
      })
      .returning();

    // Create transaction linked to input message
    await db.insert(transactions).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      inputMessageId: inputMessage.id,
      amount: "25.50",
      itemName: "午餐",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].inputMessage).toBeDefined();
    expect(data[0].inputMessage.id).toBe(inputMessage.id);
    expect(data[0].inputMessage.text).toBe("午餐花了25.5元");
    expect(data[0].inputMessage.aiResponse).toContain("午餐");
  });

  it("should return null inputMessage when transaction has no linked message", async () => {
    const db = getTestDb();

    // Create transaction without input message
    await db.insert(transactions).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      amount: "30.00",
      itemName: "手动录入",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].inputMessage).toBeNull();
  });

  it("should return inputMessage with image contentType", async () => {
    const db = getTestDb();

    const [inputMessage] = await db
      .insert(inputMessages)
      .values({
        ledgerId: testLedgerId,
        imageUrls: ["data:image/png;base64,iVBORw0KGgo..."],
        aiResponse: null,
      })
      .returning();

    await db.insert(transactions).values({
      ledgerId: testLedgerId,
      inputMessageId: inputMessage.id,
      amount: "100.00",
      itemName: "从图片识别",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data[0].inputMessage.imageUrls).toHaveLength(1);
    expect(data[0].inputMessage.imageUrls[0]).toContain("data:image");
  });

  it("should return inputMessage with contentType", async () => {
    // 1. Create input message with text
    const db = getTestDb();
    const [msg] = await db
      .insert(inputMessages)
      .values({
        ledgerId: testLedgerId,
        text: "Audio Note converted",
        aiResponse: null,
      })
      .returning();

    // 2. Create transaction linked to it
    await db.insert(transactions).values({
      ledgerId: testLedgerId,
      amount: "100",
      itemName: "Voice Item",
      inputMessageId: msg.id,
    });

    // 3. Query
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/transactions`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].inputMessage).toBeDefined();
    expect(data[0].inputMessage.text).toContain("Audio Note");
  });
  it("should filter by date range", async () => {
    const db = getTestDb();
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);



    await db.insert(transactions).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Today", transactionDate: today },
      { ledgerId: testLedgerId, amount: "20", itemName: "LastMonth", transactionDate: lastMonth },
    ]);

    // Query starting from 1st of current month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?startDate=${startOfMonth.toISOString()}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].itemName).toBe("Today");
  });

  it("should fallback to createdAt for date filtering when transactionDate is null", async () => {
    const db = getTestDb();
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    await db.insert(transactions).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Today Created", createdAt: today },
      { ledgerId: testLedgerId, amount: "20", itemName: "Old Created", createdAt: lastMonth },
    ]);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?startDate=${startOfMonth.toISOString()}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].itemName).toBe("Today Created");
  });
  it("should return pending transactions from inputMessages", async () => {
    const db = getTestDb();

    // Create an input message with status 'to_confirm' and proposed transactions
    const [msg] = await db
      .insert(inputMessages)
      .values({
        ledgerId: testLedgerId,
        text: "Purchase data",
        status: "to_confirm",
        proposedTransactions: [
          {
            itemName: "Pending Item 1",
            amount: 50,
            currency: "CNY",
            category: "餐饮", // Should match testCategoryId which is 餐饮
            notes: "Lunch with team"
          },
          {
            itemName: "Pending Item 2",
            amount: 100,
            currency: "USD",
            category: "Unknown Category"
          }
        ]
      })
      .returning();

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/transactions?status=pending`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);

    // Verify first item (fully matched)
    const item1 = data.find((t: { itemName: string }) => t.itemName === "Pending Item 1");
    expect(item1).toBeDefined();
    expect(item1.amount).toBe("50");
    expect(item1.currency).toBe("CNY");
    expect(item1.categoryId).toBe(testCategoryId);
    expect(item1.category).toBeDefined();
    expect(item1.category.name).toBe("餐饮");
    expect(item1.description).toBe("Lunch with team");
    expect(item1.id).toContain(`pending:${msg.id}`);

    // Verify second item (unmatched category)
    const item2 = data.find((t: { itemName: string; amount: string; currency: string; categoryId: string | null }) => t.itemName === "Pending Item 2");
    expect(item2).toBeDefined();
    expect(item2.amount).toBe("100");
    expect(item2.currency).toBe("USD");
    expect(item2.categoryId).toBeNull();
  });
});
