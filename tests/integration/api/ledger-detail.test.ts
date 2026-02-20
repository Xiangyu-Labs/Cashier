import { describe, it, expect } from "vitest";
import { getLedgerAction, updateLedgerAction, deleteLedgerAction } from "@/features/ledger/server/actions/ledgers";
import { getTestDb } from "../../setup";
import { ledgers } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { eq } from "drizzle-orm";

describe("Ledger Actions", () => {
  it("should return null for non-existent ledger (Get)", async () => {
    const result = await getLedgerAction("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("should update ledger name", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Original Name");

    const result = await updateLedgerAction(ledgerId, { name: "Updated Name" });

    expect(result).toBeDefined();
    expect(result.name).toBe("Updated Name");
  });

  it("should throw error for non-existent ledger (Update)", async () => {
    await expect(updateLedgerAction("00000000-0000-0000-0000-000000000000", { name: "Updated" }))
      .rejects.toThrow();
  });

  it("should delete ledger", async () => {
    const db = getTestDb();
    const { ledgerId, userId } = await createTestUserWithLedger(db, "test@example.com", "To Delete");

    // Create a second ledger so we can delete the first one (can't delete the only ledger)
    const secondLedgerId = crypto.randomUUID();
    await db.insert(ledgers).values({
      id: secondLedgerId,
      userId,
      name: "Second Ledger",
      metadata: {},
    });

    // deleteLedgerAction returns void in new format
    await deleteLedgerAction(ledgerId);

    // Verify deletion (soft delete)
    const found = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(found).toBeDefined();
    expect(found?.deletedAt).not.toBeNull();
  });

  it("should throw error for non-existent ledger (Delete)", async () => {
    await expect(deleteLedgerAction("00000000-0000-0000-0000-000000000000"))
      .rejects.toThrow();
  });
});

