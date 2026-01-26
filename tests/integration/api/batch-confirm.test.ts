import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledgers/[id]/transactions/confirm/route";
import { getTestDb } from "../../setup";
import { ledgers, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("POST /api/ledgers/[id]/transactions/confirm", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger" }).returning();
    testLedgerId = ledger.id;
  });

  it("should confirm specific transactions by IDs", async () => {
    const db = getTestDb();
    // Create pending transactions
    const [tx1] = await db.insert(transactions).values({
        ledgerId: testLedgerId,
        amount: "10",
        itemName: "Item 1",
        status: "pending",
        sourceType: "text"
    }).returning();

    const [tx2] = await db.insert(transactions).values({
        ledgerId: testLedgerId,
        amount: "20",
        itemName: "Item 2",
        status: "pending",
        sourceType: "text"
    }).returning();

    // Confirm only tx1
    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/transactions/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ transactionIds: [tx1.id] }),
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: testLedgerId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.updatedCount).toBe(1);

    // Verify DB state
    const savedTx1 = await db.query.transactions.findFirst({ where: eq(transactions.id, tx1.id) });
    const savedTx2 = await db.query.transactions.findFirst({ where: eq(transactions.id, tx2.id) });

    expect(savedTx1?.status).toBe("confirmed");
    expect(savedTx2?.status).toBe("pending");
  });

  it("should confirm all pending transactions", async () => {
    const db = getTestDb();
    await db.insert(transactions).values([
        { ledgerId: testLedgerId, amount: "10", itemName: "Item 1", status: "pending", sourceType: "text" },
        { ledgerId: testLedgerId, amount: "20", itemName: "Item 2", status: "pending", sourceType: "text" },
        // confirmed one should stay confirmed
        { ledgerId: testLedgerId, amount: "30", itemName: "Item 3", status: "confirmed", sourceType: "text" }
    ]);

    const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/transactions/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ confirmAll: true }),
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: testLedgerId }) });
    const data = await response.json();

    expect(data.updatedCount).toBe(2);

    const allTxs = await db.query.transactions.findMany({ where: eq(transactions.ledgerId, testLedgerId) });
    expect(allTxs.every(t => t.status === "confirmed")).toBe(true);
  });

  it("should validate input", async () => {
     const request = new NextRequest(
      `http://localhost/api/ledgers/${testLedgerId}/transactions/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ transactionIds: ["invalid-uuid"] }),
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: testLedgerId }) });
    expect(response.status).toBe(400);
  });
});
