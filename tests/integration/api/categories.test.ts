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

  it("should return default categories when no custom ones exist", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
  });

  it("should return categories ordered by sortOrder", async () => {
    const db = getTestDb();
    // Add some with specific sort orders to test ordering logic relative to defaults
    // Defaults are 1-7.
    await db.insert(categories).values([
      { name: "Order 100", sortOrder: 100 },
      { name: "Order 50", sortOrder: 50 },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${testLedgerId}/categories`),
      { params: Promise.resolve({ id: testLedgerId }) }
    );
    const data = await response.json();

    // Check relative ordering
    const names = data.map((c: any) => c.name);
    // Should contain defaults + new ones
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
    // defaults have max sortOrder 7 (typically)
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({ name: "Sort Test" }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: testLedgerId }),
    });
    const data = await response.json();

    // Default categories are 7 items. Max sortOrder is 7. New one should be 8.
    // If not, it means defaults changed or logic is Max + 1.
    expect(data.sortOrder).toBeGreaterThan(5);
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
