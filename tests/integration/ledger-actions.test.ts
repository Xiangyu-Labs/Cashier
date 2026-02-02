import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLedgerEntryAction } from "@/features/ledger/server/actions/get-entry";
import { getTestDb } from "../setup";
import { ledgers, ledgerEntries, users } from "@/lib/db/schema";
import { createLedgerData, createLedgerEntryData } from "../helpers/factories";
import { v4 as uuidv4 } from "uuid";

// Mock auth module
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("getLedgerEntryAction", () => {
    const testUserId = "00000000-0000-0000-0000-000000000000";

    beforeEach(() => {
        // Default mock implementation
        vi.mocked(auth).mockResolvedValue({
            user: { id: testUserId, email: "test@example.com" }
        } as unknown as any);
    });

    it("should return the ledger entry when it exists and user has access", async () => {
        const db = getTestDb();
        // 1. Create Ledger
        const ledgerData = createLedgerData({ userId: testUserId });
        await db.insert(ledgers).values(ledgerData);

        // 2. Create Entry
        const entryData = createLedgerEntryData(ledgerData.id);
        await db.insert(ledgerEntries).values(entryData);

        // 3. Action
        const result = await getLedgerEntryAction(entryData.id);

        // 4. Assertion
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        if (result.success && result.data) {
            expect(result.data.id).toBe(entryData.id);
            expect(result.data.ledgerId).toBe(ledgerData.id);
        }
    });


    it("should return error when entry does not exist", async () => {
        const result = await getLedgerEntryAction(uuidv4());
        expect(result.success).toBe(false);
        expect(result.error).toContain("Link not found");
    });

    it("should return error when user does not have access to the ledger", async () => {
        // 1. Create Ledger for ANOTHER user
        const otherUserId = "11111111-1111-1111-1111-111111111111";

        // Mock auth to return the default test user, BUT the ledger belongs to otherUserId
        // The global setup already creates testUserId. We need to verify that testUserId cannot access otherUserId's ledger.
        // So we don't need to change the auth mock here, just create data for another user.

        // Ensure other user exists
        const db = getTestDb();
        await db.insert(users).values({
            id: otherUserId,
            email: "other@example.com",
            name: "Other User",
            emailVerified: new Date()
        }).onConflictDoNothing();

        const ledgerData = createLedgerData({ userId: otherUserId });
        await db.insert(ledgers).values(ledgerData);

        // 2. Create Entry
        const entryData = createLedgerEntryData(ledgerData.id);
        await db.insert(ledgerEntries).values(entryData);

        // 3. Action (Current authenticated user is testUserId)
        const result = await getLedgerEntryAction(entryData.id);

        // 4. Assertion
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
