/**
 * Multi-User Isolation Tests
 *
 * These tests verify that users cannot access data belonging to other users.
 * This is critical for the security of the multi-user architecture.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import {
    TEST_USER_ID,
    createTestUserWithLedger,
} from "../../helpers/schema-setup";
import { NextRequest } from "next/server";
import { getLedgerAction, updateLedgerAction, deleteLedgerAction } from "@/features/ledger/server/actions";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions";
import { getSourceDocumentsAction } from "@/features/source-document/server/actions";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions";
import { getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";

// Mock auth
import { auth } from "@/auth";
import { vi } from "vitest";

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

// Second test user
const TEST_USER_ID_2 = "11111111-1111-1111-1111-111111111111";

describe("Multi-User Isolation", () => {
    let user1Ledger: string;
    let user2Ledger: string;

    beforeEach(async () => {
        const db = getTestDb();

        // Create two users with their own ledgers
        const user1Result = await createTestUserWithLedger(
            db,
            "user1@example.com",
            "User 1 Ledger",
            TEST_USER_ID
        );
        user1Ledger = user1Result.ledgerId;

        const user2Result = await createTestUserWithLedger(
            db,
            "user2@example.com",
            "User 2 Ledger",
            TEST_USER_ID_2
        );
        user2Ledger = user2Result.ledgerId;
    });

    describe("Ledger Actions Isolation", () => {
        it("should refuse access when user1 tries to access user2 ledger", async () => {
            // User 1 trying to access User 2's ledger
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            await expect(getLedgerAction(user2Ledger)).rejects.toThrow("Unauthorized or Ledger not found");
        });

        it("should allow access when user1 accesses their own ledger", async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            const result = await getLedgerAction(user1Ledger);
            expect(result.id).toBe(user1Ledger);
        });

        it("should refuse update when user1 tries to update user2 ledger", async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            const result = await updateLedgerAction(user2Ledger, { name: "Hacked" });
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unauthorized");
        });

        it("should refuse delete when user1 tries to delete user2 ledger", async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            const result = await deleteLedgerAction(user2Ledger);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unauthorized");
        });
    });

    describe("Sub-resource Isolation", () => {
        // Re-mock for each sub-test to ensure User 1 context
        beforeEach(() => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });
        });

        it("should refuse access to user2 ledger entries", async () => {
            // getLedgerEntriesAction calls requireLedgerAccess internally
            // This usually throws Error("Unauthorized") or returns error object depending on implementation.
            // In new Actions pattern, some return { success: false } or throw. 
            // `getLedgerEntriesAction` throws if unauthorized? Let's check.
            // Actually `getLedgerEntriesAction` in my implementation (checked previously) throws Error("Unauthorized") if check fails.

            await expect(getLedgerEntriesAction(user2Ledger, {}))
                .rejects.toThrow("Unauthorized");
        });

        it("should refuse access to user2 source documents", async () => {
            await expect(getSourceDocumentsAction(user2Ledger, {}))
                .rejects.toThrow("Unauthorized");
        });

        it("should refuse access to user2 entry categories", async () => {
            await expect(getEntryCategoriesAction(user2Ledger))
                .rejects.toThrow("Unauthorized");
        });

        it("should refuse access to user2 service credentials", async () => {
            await expect(getServiceCredentialsAction(user2Ledger))
                .rejects.toThrow("Unauthorized");
        });
    });


});
