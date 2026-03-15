import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Override the global auth mock for specific tests
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

import { auth } from "@/auth";
import {
    getCurrentUser,
    requireAuth,
    requireLedgerAccess,
} from "@/features/auth/server/utils/helpers";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function mockSession(userId = TEST_USER_ID, email = "test@example.com") {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({
        user: { id: userId, email },
        expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
}

function mockNoSession() {
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(null);
}

describe("getCurrentUser", () => {
    it("returns user when session exists", async () => {
        mockSession();
        const user = await getCurrentUser();
        expect(user).not.toBeNull();
        expect(user?.id).toBe(TEST_USER_ID);
        expect(user?.email).toBe("test@example.com");
    });

    it("returns null when no session", async () => {
        mockNoSession();
        const user = await getCurrentUser();
        expect(user).toBeNull();
    });
});

describe("requireAuth", () => {
    it("returns user when authenticated", async () => {
        mockSession();
        const result = await requireAuth();
        expect(result.user).toBeDefined();
        expect(result.user?.id).toBe(TEST_USER_ID);
        expect(result.error).toBeUndefined();
    });

    it("returns 401 error response when not authenticated", async () => {
        mockNoSession();
        const result = await requireAuth();
        expect(result.error).toBeDefined();
        expect(result.user).toBeUndefined();
        const response = result.error!;
        expect(response.status).toBe(401);
    });
});

describe("requireLedgerAccess", () => {
    let ledgerId: string;

    beforeEach(async () => {
        mockSession();
        const db = getTestDb();
        ledgerId = uuidv4();

        // Clean up any existing ledgers for this user first (due to unique constraint)
        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));

        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("returns userId and ledger when user owns the ledger", async () => {
        const result = await requireLedgerAccess(ledgerId);
        expect(result.error).toBeUndefined();
        expect(result.userId).toBe(TEST_USER_ID);
        expect(result.ledger?.id).toBe(ledgerId);
    });

    it("returns 404 error when ledger belongs to another user", async () => {
        const db = getTestDb();
        const otherUserId = uuidv4();

        await db.insert(users).values({
            id: otherUserId,
            email: "other@example.com",
            name: "Other User",
            emailVerified: new Date(),
        }).onConflictDoNothing();

        const otherLedgerId = uuidv4();
        await db.insert(ledgers).values({
            id: otherLedgerId,
            userId: otherUserId,
            name: "Other Ledger",
            metadata: {},
        });

        const result = await requireLedgerAccess(otherLedgerId);
        expect(result.error).toBeDefined();
        expect(result.userId).toBeUndefined();
        expect(result.error?.status).toBe(404);
    });

    it("returns 404 error for invalid UUID", async () => {
        const result = await requireLedgerAccess("not-a-valid-uuid");
        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe(404);
    });

    it("returns 404 error for soft-deleted ledger", async () => {
        const db = getTestDb();
        const deletedLedgerId = uuidv4();
        await db.insert(ledgers).values({
            id: deletedLedgerId,
            userId: TEST_USER_ID,
            name: "Deleted Ledger",
            metadata: {},
            deletedAt: new Date(),
        });

        const result = await requireLedgerAccess(deletedLedgerId);
        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe(404);
    });

    it("returns 401 error when not authenticated", async () => {
        mockNoSession();
        const result = await requireLedgerAccess(ledgerId);
        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe(401);
    });
});
