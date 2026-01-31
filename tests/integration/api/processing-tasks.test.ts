import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/processing-tasks/route";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { auth } from "@/auth";

// Mock auth module
import { vi } from "vitest";
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

describe("Processing Tasks API Security", () => {
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

        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${testLedgerId}`
        );
        const res = await GET(req);

        expect(res.status).toBe(200);
    });

    it("should deny access when user is not authenticated", async () => {
        // Mock unauthenticated
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${testLedgerId}`
        );
        const res = await GET(req);

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Unauthorized");
    });

    it("should deny access when user requests another user's ledger (IDOR)", async () => {
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

        const req = new NextRequest(
            `http://localhost/api/processing-tasks?ledgerId=${otherLedgerId}`
        );
        const res = await GET(req);

        // Should be 404 (Not Found) to avoid leaking existence, or 401/403.
        // requireLedgerAccess usually returns 404 if not found/owned.
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("Ledger not found");
    });
});
