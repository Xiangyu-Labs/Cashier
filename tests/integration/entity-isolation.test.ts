
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import { createTestUserWithLedger } from "../helpers/schema-setup";
import { LedgerScope } from "@/features/ledger/server/service";
import { ledgerEntries } from "@/features/ledger/server/schema";
import { eq } from "drizzle-orm";

describe("Entity Isolation (LedgerScope)", () => {
    let user1LedgerId: string;
    let user2LedgerId: string;
    let user2EntryId: string;

    beforeEach(async () => {
        const db = getTestDb();

        // 1. Setup User 1 (Attacker)
        const user1 = await createTestUserWithLedger(
            db,
            "attacker@example.com",
            "Attacker Ledger",
            "11111111-1111-1111-1111-111111111111"
        );
        user1LedgerId = user1.ledgerId;

        // 2. Setup User 2 (Victim)
        const user2 = await createTestUserWithLedger(
            db,
            "victim@example.com",
            "Victim Ledger",
            "22222222-2222-2222-2222-222222222222"
        );
        user2LedgerId = user2.ledgerId;

        // 3. Create a sensitive entry in User 2's ledger directly via DB
        const [entry] = await db.insert(ledgerEntries).values({
            ledgerId: user2LedgerId,
            amount: "100.00",
            currency: "USD",
            itemName: "Secret Transaction",
            entryDate: new Date(),
        }).returning();
        user2EntryId = entry.id;
    });

    it("should preventing getting another user's entry by ID", async () => {
        const scope = new LedgerScope(user1LedgerId);

        // Attacker tries to get Victim's entry
        const result = await scope.entries.get(user2EntryId);

        expect(result).toBeNull();
    });

    it("should prevent updating another user's entry", async () => {
        const scope = new LedgerScope(user1LedgerId);

        // Attacker tries to update Victim's entry
        await expect(scope.entries.update(user2EntryId, {
            itemName: "HACKED"
        })).rejects.toThrow(); // Should throw "not found or access denied"

        // Verify it wasn't changed
        const db = getTestDb();
        const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, user2EntryId));
        expect(entry.itemName).toBe("Secret Transaction");
    });

    it("should prevent deleting another user's entry", async () => {
        const scope = new LedgerScope(user1LedgerId);

        // Attacker tries to delete Victim's entry
        await scope.entries.delete(user2EntryId);

        // Verify it still exists
        const db = getTestDb();
        const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, user2EntryId));
        expect(entry).toBeDefined();
        expect(entry.id).toBe(user2EntryId);
    });

    it("should allow access to own entries", async () => {
        const scope = new LedgerScope(user1LedgerId);

        // Create an entry for User 1
        const created = await scope.entries.create({
            amount: "50.00",
            // currency: "USD",
            itemName: "My Own Item",
            entryDate: new Date(),
        } as any);

        // Should be able to get it
        const fetched = await scope.entries.get(created.id);
        expect(fetched).toBeDefined();
        expect(fetched?.id).toBe(created.id);

        // Should be able to update it
        const updated = await scope.entries.update(created.id, { itemName: "Updated Item" });
        expect(updated.itemName).toBe("Updated Item");

        // Should be able to delete it
        await scope.entries.delete(created.id);
        const deleted = await scope.entries.get(created.id);
        expect(deleted).toBeNull();
    });
});
