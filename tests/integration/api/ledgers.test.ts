import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ledgers/route";
import { PATCH } from "@/app/api/ledgers/[id]/route";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories as categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TEST_USER_ID } from "../../helpers/schema-setup";

describe("GET /api/ledgers", () => {
  it("should return empty array when no ledgers exist", async () => {
    const request = new NextRequest("http://localhost/api/ledgers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return all ledgers ordered by createdAt desc", async () => {
    const db = getTestDb();

    // Create ledgers with slight delay to ensure different timestamps
    await db.insert(ledgers).values({ name: "First Ledger", userId: TEST_USER_ID });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await db.insert(ledgers).values({ name: "Second Ledger", userId: TEST_USER_ID });

    const request = new NextRequest("http://localhost/api/ledgers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Second Ledger");
    expect(data[1].name).toBe("First Ledger");
  });
});

describe("POST /api/ledgers", () => {
  it("should create a new ledger", async () => {
    const request = new NextRequest("http://localhost/api/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: "New Ledger" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("New Ledger");
    expect(data.id).toBeDefined();
    expect(data.aiLanguage).toBe("zh-CN");
    expect(data.currencies).toEqual(["USD", "AUD", "BRL", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "JPY", "SGD"]);

    // Verify default categories are seeded
    const db = getTestDb();
    const ledgerCategories = await db.query.entryCategories.findMany({
      where: eq(categories.ledgerId, data.id),
    });
    expect(ledgerCategories.length).toBeGreaterThan(0);
    expect(ledgerCategories.map((c: { name: string }) => c.name)).toContain("餐饮"); // Check for one of the defaults
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
});

describe("PATCH /api/ledgers/[id]", () => {
  it("should update ledger settings including all configuration flags", async () => {
    const db = getTestDb();
    const [ledger] = await db.insert(ledgers).values({ name: "Old Name", userId: TEST_USER_ID }).returning();

    const request = new NextRequest(`http://localhost/api/ledgers/${ledger.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        aiLanguage: "en",
        currencies: ["USD", "EUR"],
        mainCurrency: "USD",
        autoRecognizeDate: true,
        collapseProcessingDefault: true,
        mergeSimilarItems: true
      }),
    });

    // Mock params
    const paramsPromise = Promise.resolve({ id: ledger.id });
    const response = await PATCH(request, { params: paramsPromise });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.aiLanguage).toBe("en");
    expect(data.currencies).toEqual(["USD", "EUR"]);
    expect(data.mainCurrency).toBe("USD");
    expect(data.autoRecognizeDate).toBe(true);
    expect(data.collapseProcessingDefault).toBe(true);
    expect(data.mergeSimilarItems).toBe(true);

    // Verify db persistence
    const updated = await db.query.ledgers.findFirst({ where: eq(ledgers.id, ledger.id) });
    expect(updated?.aiLanguage).toBe("en");
    expect(updated?.currencies).toEqual(["USD", "EUR"]);
    expect(updated?.mainCurrency).toBe("USD");
    expect(updated?.autoRecognizeDate).toBe(true);
    expect(updated?.collapseProcessingDefault).toBe(true);
    expect(updated?.mergeSimilarItems).toBe(true);
  });
});
