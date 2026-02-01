import { describe, it, expect, beforeEach } from "vitest";
import { getProcessingTasksAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { auth } from "@/auth";

// Mock auth module
import { vi } from "vitest";
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

describe("Processing Tasks Action Security", () => {
    let testLedgerId: string;
    let testUserId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const { ledgerId, userId } = await createTestUserWithLedger(db, "test-tasks@example.com", "Tasks Test Ledger");
        testLedgerId = ledgerId;
        testUserId = userId;
    });

    it("should allow access when user owns the ledger", async () => {
        // Mock authenticated user
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: testUserId }
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

        // Use original user (testUserId) trying to access otherLedgerId
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: testUserId }
        });

        await expect(getProcessingTasksAction(otherLedgerId, {}))
            .rejects.toThrow("Unauthorized");
    });
});
