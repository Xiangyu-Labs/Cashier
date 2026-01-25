import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/ledgers/[id]/route";
import { getTestDb } from "../../setup";
import { ledgers, categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("GET /api/ledgers/[id]", () => {
  it("should return ledger with categories", async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger" })
      .returning();

    await db.insert(categories).values([
      { ledgerId: ledger.id, name: "餐饮", sortOrder: 1 },
      { ledgerId: ledger.id, name: "交通", sortOrder: 2 },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Test Ledger");
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].name).toBe("餐饮");
    expect(data.categories[1].name).toBe("交通");
  });

  it("should return 404 for non-existent ledger", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/ledgers/non-existent"),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Ledger not found");
  });
});

describe("PATCH /api/ledgers/[id]", () => {
  it("should update ledger name", async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Original Name" })
      .returning();

    const request = new NextRequest(`http://localhost/api/ledgers/${ledger.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Updated Name");
  });

  it("should update ledger language", async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "Test Ledger", language: "zh-CN" })
      .returning();

    const request = new NextRequest(`http://localhost/api/ledgers/${ledger.id}`, {
      method: "PATCH",
      body: JSON.stringify({ language: "en" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: ledger.id }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.language).toBe("en");
  });

  it("should return 404 for non-existent ledger", async () => {
    const request = new NextRequest("http://localhost/api/ledgers/non-existent", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/ledgers/[id]", () => {
  it("should delete ledger", async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "To Delete" })
      .returning();

    const response = await DELETE(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify deletion
    const found = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledger.id),
    });
    expect(found).toBeUndefined();
  });

  it("should cascade delete categories", async () => {
    const db = getTestDb();
    const [ledger] = await db
      .insert(ledgers)
      .values({ name: "With Categories" })
      .returning();

    await db.insert(categories).values({
      ledgerId: ledger.id,
      name: "Will Be Deleted",
      sortOrder: 1,
    });

    await DELETE(
      new NextRequest(`http://localhost/api/ledgers/${ledger.id}`),
      { params: Promise.resolve({ id: ledger.id }) }
    );

    const orphaned = await db.query.categories.findMany({
      where: eq(categories.ledgerId, ledger.id),
    });
    expect(orphaned).toHaveLength(0);
  });

  it("should return 404 for non-existent ledger", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/ledgers/non-existent"),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) }
    );

    expect(response.status).toBe(404);
  });
});
