import { describe, it, expect, beforeEach } from "vitest";
import { getProcessingTasksAction } from "@/features/source-document/server/actions/processing";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

// Mock auth module
import { vi } from "vitest";
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

describe("Processing Tasks Action Security", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        // Clean up existing ledger for TEST_USER_ID to avoid unique constraint
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const { ledgerId } = await createTestUserWithLedger(db, undefined, "Tasks Test Ledger", TEST_USER_ID);
        testLedgerId = ledgerId;
    });

    it("should allow access when user owns the ledger", async () => {
        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: TEST_USER_ID }
        });

        const tasks = await getProcessingTasksAction(testLedgerId, {});

        expect(tasks).toBeDefined();
        expect(Array.isArray(tasks)).toBe(true);
    });

    it("should throw error when user is not authenticated", async () => {
        // Mock unauthenticated
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        await expect(getProcessingTasksAction(testLedgerId, {}))
            .rejects.toThrow("Unauthorized");
    });

    it("should throw error when user requests another user's ledger (IDOR)", async () => {
        const db = getTestDb();
        // Create another user and ledger with a DIFFERENT ID
        const victimId = "11111111-1111-1111-1111-111111111111";
        const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
            db,
            "victim@example.com",
            "Victim Ledger",
            victimId
        );

        // Use original user (TEST_USER_ID) trying to access otherLedgerId
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: TEST_USER_ID }
        });

        await expect(getProcessingTasksAction(otherLedgerId, {}))
            .rejects.toThrow("Ledger not found");
    });
});
