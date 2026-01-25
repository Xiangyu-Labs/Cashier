import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ledgers/route";
import { getTestDb } from "../../setup";
import { ledgers, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("GET /api/ledgers", () => {
  it("should return empty array when no ledgers exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return all ledgers ordered by createdAt desc", async () => {
    const db = getTestDb();

    // Create ledgers with slight delay to ensure different timestamps
    await db.insert(ledgers).values({ name: "First Ledger" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await db.insert(ledgers).values({ name: "Second Ledger" });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Second Ledger");
    expect(data[1].name).toBe("First Ledger");
  });
});

describe("POST /api/ledgers", () => {
  it("should create a new ledger with default categories", async () => {
    const request = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "New Ledger" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("New Ledger");
    expect(data.language).toBe("zh-CN");
    expect(data.id).toBeDefined();

    // Verify categories were created
    const db = getTestDb();
    const cats = await db.query.categories.findMany({
      where: eq(categories.ledgerId, data.id),
    });
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.map((c) => c.name)).toContain("餐饮");
  });

  it("should return 400 for missing name", async () => {
    const request = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("should return 400 for empty name", async () => {
    const request = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("should accept custom language", async () => {
    const request = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "English Ledger", language: "en" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.language).toBe("en");
  });
});
