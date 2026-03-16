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
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { updateLedgerAction } from "@/features/ledger/server/actions/update";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getSourceDocumentsAction } from "@/features/source-document/server/actions";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
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

            // getLedgerAction now returns null for not found/unauthorized
            const result = await getLedgerAction(user2Ledger);
            expect(result).toBeNull();
        });

        it("should allow access when user1 accesses their own ledger", async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            // getLedgerAction now returns data directly
            const result = await getLedgerAction(user1Ledger);
            expect(result).not.toBeNull();
            expect(result!.id).toBe(user1Ledger);
        });

        it("should refuse update when user1 tries to update user2 ledger", async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
                user: { id: TEST_USER_ID }
            });

            // should throw error in new format
            await expect(updateLedgerAction(user2Ledger, { settings: { aiLanguage: "en" } }))
                .rejects.toThrow();
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
            await expect(getLedgerEntriesAction(user2Ledger, {}))
                .rejects.toThrow("Ledger not found");
        });

        it("should refuse access to user2 source documents", async () => {
            await expect(getSourceDocumentsAction(user2Ledger, {}))
                .rejects.toThrow("Ledger not found");
        });

        it("should refuse access to user2 entry categories", async () => {
            await expect(getEntryCategoriesAction(user2Ledger))
                .rejects.toThrow("Ledger not found");
        });

        it("should refuse access to user2 service credentials", async () => {
            await expect(getServiceCredentialsAction(user2Ledger))
                .rejects.toThrow("Ledger not found");
        });
    });


});
