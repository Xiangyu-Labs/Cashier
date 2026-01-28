import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/ledgers/[id]/ledger-entries/route";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories, ledgerEntries, sourceDocuments } from "@/lib/db/schema";

describe("GET /api/ledgers/[id]/ledger-entries", () => {
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
      .insert(entryCategories)
      .values({
        ledgerId: testLedgerId,
        name: "餐饮",
        sortOrder: 1,
      })
      .returning();
    testCategoryId = category.id;
  });

  it("should return empty array when no ledger entries exist", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.nextCursor).toBeNull();
  });

  it("should return ledger entries with category relation", async () => {
    const db = getTestDb();
    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      amount: "25.50",
      itemName: "午餐",
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/ledgers/${testLedgerId}/ledger-entries`
      ),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("午餐");
    expect(data.items[0].category.name).toBe("餐饮");
  });

  it("should filter by categoryId", async () => {
    const db = getTestDb();
    const [otherCategory] = await db
      .insert(entryCategories)
      .values({ ledgerId: testLedgerId, name: "交通", sortOrder: 2 })
      .returning();

    await db.insert(ledgerEntries).values([
      { ledgerId: testLedgerId, categoryId: testCategoryId, amount: "10", itemName: "餐饮交易" },
      { ledgerId: testLedgerId, categoryId: otherCategory.id, amount: "20", itemName: "交通交易" },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?categoryId=${testCategoryId}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("餐饮交易");
  });

  it("should respect limit parameter", async () => {
    const db = getTestDb();
    await db.insert(ledgerEntries).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Item 1" },
      { ledgerId: testLedgerId, amount: "20", itemName: "Item 2" },
      { ledgerId: testLedgerId, amount: "30", itemName: "Item 3" },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?limit=2`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items).toHaveLength(2);
  });

  it("should respect offset parameter", async () => {
    const db = getTestDb();
    // Insert with delays to ensure ordering
    await db.insert(ledgerEntries).values({ ledgerId: testLedgerId, amount: "10", itemName: "Oldest" });
    await new Promise((r) => setTimeout(r, 10));
    await db.insert(ledgerEntries).values({ ledgerId: testLedgerId, amount: "20", itemName: "Middle" });
    await new Promise((r) => setTimeout(r, 10));
    await db.insert(ledgerEntries).values({ ledgerId: testLedgerId, amount: "30", itemName: "Newest" });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?offset=1&limit=1`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("Middle");
  });

  it("should return 400 for invalid categoryId", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?categoryId=not-a-uuid`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );

    expect(response.status).toBe(400);
  });

  it("should return ledger entries with source document relation when linked", async () => {
    const db = getTestDb();

    // Create a source document
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "午餐花了25.5元",
        aiResponse: JSON.stringify({ ledgerEntries: [{ item_name: "午餐", amount: 25.5 }] }),
      })
      .returning();

    // Create ledger entry linked to source document
    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      sourceDocumentId: doc.id,
      amount: "25.50",
      itemName: "午餐",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sourceDocument).toBeDefined();
    expect(data.items[0].sourceDocument.id).toBe(doc.id);
    expect(data.items[0].sourceDocument.text).toBe("午餐花了25.5元");
    expect(data.items[0].sourceDocument.aiResponse).toContain("午餐");
  });

  it("should return null source document when ledger entry has no linked document", async () => {
    const db = getTestDb();

    // Create ledger entry without source document
    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      amount: "30.00",
      itemName: "手动录入",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sourceDocument).toBeNull();
  });

  it("should return source document with image usage", async () => {
    const db = getTestDb();

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        imageUrls: ["data:image/png;base64,iVBORw0KGgo..."],
        aiResponse: null,
      })
      .returning();

    await db.insert(ledgerEntries).values({
      ledgerId: testLedgerId,
      sourceDocumentId: doc.id,
      amount: "100.00",
      itemName: "从图片识别",
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items[0].sourceDocument.imageUrls).toHaveLength(1);
    expect(data.items[0].sourceDocument.imageUrls[0]).toContain("data:image");
  });

  it("should filter by date range", async () => {
    const db = getTestDb();
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    await db.insert(ledgerEntries).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Today", entryDate: today },
      { ledgerId: testLedgerId, amount: "20", itemName: "LastMonth", entryDate: lastMonth },
    ]);

    // Query starting from 1st of current month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?startDate=${startOfMonth.toISOString()}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("Today");
  });

  it("should fallback to createdAt for date filtering when entryDate is null", async () => {
    const db = getTestDb();
    const today = new Date();
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    await db.insert(ledgerEntries).values([
      { ledgerId: testLedgerId, amount: "10", itemName: "Today Created", createdAt: today },
      { ledgerId: testLedgerId, amount: "20", itemName: "Old Created", createdAt: lastMonth },
    ]);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?startDate=${startOfMonth.toISOString()}`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data.items).toHaveLength(1);
    expect(data.items[0].itemName).toBe("Today Created");
  });

  it("should return pending ledger entries from source documents", async () => {
    const db = getTestDb();

    // Create a source document with status 'to_confirm'
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "Purchase data",
        status: "to_confirm"
      })
      .returning();

    // Create real pending ledger entries
    const [entry1, entry2] = await db.insert(ledgerEntries).values([
      {
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        itemName: "Pending Item 1",
        amount: "50.00",
        currency: "CNY",
        categoryId: testCategoryId,
        description: "Lunch with team",
        status: "pending"
      },
      {
        ledgerId: testLedgerId,
        sourceDocumentId: doc.id,
        itemName: "Pending Item 2",
        amount: "100.00",
        currency: "USD",
        categoryId: null,
        status: "pending"
      }
    ]).returning();

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/ledger-entries?status=pending`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(2);

    // Verify first item (fully matched)
    const item1 = data.items.find((t: { itemName: string }) => t.itemName === "Pending Item 1");
    expect(item1).toBeDefined();
    expect(item1.amount).toBe("50.00");
    expect(item1.currency).toBe("CNY");
    expect(item1.categoryId).toBe(testCategoryId);
    expect(item1.category).toBeDefined();
    expect(item1.category.name).toBe("餐饮");
    expect(item1.description).toBe("Lunch with team");
    expect(item1.id).toBe(entry1.id); // Should be a real UUID

    // Verify second item (unmatched category)
    const item2 = data.items.find((t: { itemName: string; amount: string; currency: string; categoryId: string | null }) => t.itemName === "Pending Item 2");
    expect(item2).toBeDefined();
    expect(item2.amount).toBe("100.00");
    expect(item2.currency).toBe("USD");
    expect(item2.categoryId).toBeNull();
    expect(item2.id).toBe(entry2.id); // Should be a real UUID
  });
});
