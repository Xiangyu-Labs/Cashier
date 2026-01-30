import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ledgers/[id]/entry-categories/route";
import { POST as REORDER } from "@/app/api/ledgers/[id]/entry-categories/reorder/route";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories as categories } from "@/lib/db/schema";

import { EntryCategory as Category } from "@/types/api";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("GET /api/ledgers/[id]/categories", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;
  });

  it("should return empty list when no custom ones exist", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = (await response.json()) as Category[];

    expect(response.status).toBe(200);
    expect(data.length).toBe(0);
  });

  it("should return categories ordered by sortOrder", async () => {
    const db = getTestDb();
    // Add some with specific sort orders to test ordering logic relative to defaults
    await db.insert(categories).values([
      { ledgerId: testLedgerId, name: "Order 100", sortOrder: 100 },
      { ledgerId: testLedgerId, name: "Order 50", sortOrder: 50 },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = (await response.json()) as Category[];

    // Check relative ordering
    const names = data.map((c) => c.name);

    expect(names).toHaveLength(2);
    expect(names).toContain("Order 50");
    expect(names).toContain("Order 100");
    // Verify sort
    const idx50 = names.indexOf("Order 50");
    const idx100 = names.indexOf("Order 100");
    expect(idx50).toBeLessThan(idx100);
  });
});

describe("POST /api/ledgers/[id]/categories", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
    testLedgerId = ledgerId;
  });

  it("should create a new category", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({ name: "新分类" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("新分类");
  });

  it("should create category with all fields", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "自定义",
          description: "描述",
          icon: "🚗",
          sortOrder: 20,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.description).toBe("描述");
    expect(data.icon).toBe("🚗");
    expect(data.sortOrder).toBe(20);
  });

  it("should auto-increment sortOrder", async () => {
    // Create first category
    await POST(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: "First" }),
      }),
      { params: Promise.resolve({ id: testLedgerId }) }
    );

    // Create second category
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({ name: "Second" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    // First one should be 1, second one should be 2
    expect(data.sortOrder).toBe(2);
  });

  it("should return 400 for missing name", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
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
    expect(data.error).toBe("Validation failed");
  });

  it("should return 400 for empty name", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/ledgers/[id]/categories/reorder", () => {
  let testLedgerId: string;
  let category1Id: string;
  let category2Id: string;
  let category3Id: string;

  beforeEach(async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Reorder Test Ledger");
    testLedgerId = ledgerId;

    // Create 3 categories
    const [c1] = await db.insert(categories).values({ ledgerId: testLedgerId, name: "Cat 1", sortOrder: 0 }).returning();
    const [c2] = await db.insert(categories).values({ ledgerId: testLedgerId, name: "Cat 2", sortOrder: 1 }).returning();
    const [c3] = await db.insert(categories).values({ ledgerId: testLedgerId, name: "Cat 3", sortOrder: 2 }).returning();

    category1Id = c1.id;
    category2Id = c2.id;
    category3Id = c3.id;
  });

  it("should reorder categories based on input array", async () => {
    // Reorder to: 3, 1, 2
    const newOrder = [category3Id, category1Id, category2Id];

    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories/reorder`,
      {
        method: "POST",
        body: JSON.stringify({ categoryIds: newOrder }),
      }
    );

    const response = await REORDER(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });

    expect(response.status).toBe(200);

    // Verify DB
    const db = getTestDb();
    const allCategories = await db.query.entryCategories.findMany({
      where: (cat, { eq }) => eq(cat.ledgerId, testLedgerId),
    });

    const c1 = allCategories.find((c) => c.id === category1Id);
    const c2 = allCategories.find((c) => c.id === category2Id);
    const c3 = allCategories.find((c) => c.id === category3Id);

    expect(c3?.sortOrder).toBe(0);
    expect(c1?.sortOrder).toBe(1);
    expect(c2?.sortOrder).toBe(2);
  });

  it("should return 400 if categories count mismatch", async () => {
    // Only provide 2 but there are 3 in ledger (wait, no, logic is simple 'in' check?)
    // Actually the logic in route is: if (existingCategories.length !== categoryIds.length)
    // So if we pass IDs that don't belong to ledger, or duplicates, it fails.

    // Case: Pass an ID that doesn't exist (but valid UUID)
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories/reorder`,
      {
        method: "POST",
        body: JSON.stringify({ categoryIds: [category1Id, "00000000-0000-0000-0000-000000000000"] }),
      }
    );

    const response = await REORDER(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });

    expect(response.status).toBe(400);
  });
});
