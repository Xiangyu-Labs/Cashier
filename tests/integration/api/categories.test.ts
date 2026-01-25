import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ledgers/[id]/categories/route";
import { getTestDb } from "../../setup";
import { ledgers, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("GET /api/ledgers/[id]/categories", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger" })
      .returning();
    testLedgerId = ledger.id;
  });

  it("should return empty array when no categories exist", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return categories ordered by sortOrder", async () => {
    const db = getTestDb();
    await db.insert(categories).values([
      { ledgerId: testLedgerId, name: "交通", sortOrder: 2 },
      { ledgerId: testLedgerId, name: "餐饮", sortOrder: 1 },
      { ledgerId: testLedgerId, name: "娱乐", sortOrder: 3 },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(data).toHaveLength(3);
    expect(data[0].name).toBe("餐饮");
    expect(data[1].name).toBe("交通");
    expect(data[2].name).toBe("娱乐");
  });
});

describe("POST /api/ledgers/[id]/categories", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger" })
      .returning();
    testLedgerId = ledger.id;
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
    expect(data.ledgerId).toBe(testLedgerId);
  });

  it("should create category with all fields", async () => {
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "交通",
          description: "公交、地铁、打车",
          icon: "🚗",
          sortOrder: 5,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.description).toBe("公交、地铁、打车");
    expect(data.icon).toBe("🚗");
    expect(data.sortOrder).toBe(5);
  });

  it("should auto-increment sortOrder", async () => {
    const db = getTestDb();
    await db.insert(categories).values({
      ledgerId: testLedgerId,
      name: "已有分类",
      sortOrder: 3,
    });

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

    expect(data.sortOrder).toBe(4);
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
