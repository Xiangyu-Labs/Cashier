import { describe, it, expect } from "vitest";
import { getLedgerAction, updateLedgerAction, deleteLedgerAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { ledgers } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { eq } from "drizzle-orm";

describe("Ledger Actions", () => {
  it("should return error for non-existent ledger (Get)", async () => {
    try {
      await getLedgerAction("00000000-0000-0000-0000-000000000000");
      expect.fail("Should throw error");
    } catch (e: any) {
      expect(e.message).toContain("Unauthorized");
    }
  });

  it("should update ledger name", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Original Name");

    const result = await updateLedgerAction(ledgerId, { name: "Updated Name" });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Updated Name");
  });

  it("should return error for non-existent ledger (Update)", async () => {
    const result = await updateLedgerAction("00000000-0000-0000-0000-000000000000", { name: "Updated" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unauthorized");
  });

  it("should delete ledger", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "To Delete");

    const result = await deleteLedgerAction(ledgerId);

    expect(result.success).toBe(true);

    // Verify deletion (soft delete)
    const found = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(found).toBeDefined();
    expect(found?.deletedAt).not.toBeNull();
  });

  it("should return error for non-existent ledger (Delete)", async () => {
    const result = await deleteLedgerAction("00000000-0000-0000-0000-000000000000");
    expect(result.success).toBe(false);
  });
});
