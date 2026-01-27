import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/ledgers/[id]/route";
import { getTestDb } from "../../setup";
import { ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("GET /api/ledgers/[id]", () => {
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

  it("should return 404 for non-existent ledger", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/ledgers/non-existent"),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) }
    );

    expect(response.status).toBe(404);
  });
});
