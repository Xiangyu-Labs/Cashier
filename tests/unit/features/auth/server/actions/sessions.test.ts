import { describe, it, expect, vi, beforeEach } from "vitest";
import { getActiveSessionsAction, revokeSessionAction } from "@/features/auth/server/actions/sessions";
import { db } from "@/lib/db";
import { sessions } from "@/features/auth/server/schema";
import * as Auth from "@/auth";

// Mocks
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    db: {
        query: {
            sessions: {
                findMany: vi.fn(),
                findFirst: vi.fn(),
            },
        },
        delete: vi.fn(() => ({
            where: vi.fn(),
        })),
    },
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Session Actions", () => {
    const mockUserId = "user-123";
    const mockSessionToken = "session-abc";

    beforeEach(() => {
        vi.clearAllMocks();
        // Setup authenticated session
        (Auth.auth as any).mockResolvedValue({
            user: { id: mockUserId },
            sessionId: "current-session-id"
        });
    });

    describe("getActiveSessionsAction", () => {
        it("should return formatted sessions", async () => {
            const mockDbSessions = [
                {
                    sessionToken: "current-session-id",
                    userId: mockUserId,
                    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    ipAddress: "127.0.0.1",
                    lastActiveAt: new Date("2024-01-01T12:00:00Z"),
                },
                {
                    sessionToken: "other-session-id",
                    userId: mockUserId,
                    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                    ipAddress: "10.0.0.1",
                    lastActiveAt: new Date("2024-01-01T10:00:00Z"),
                }
            ];

            (db.query.sessions.findMany as any).mockResolvedValue(mockDbSessions);

            const result = await getActiveSessionsAction();

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);

            // Check current session
            const current = result.data?.find(s => s.isCurrent);
            expect(current).toBeDefined();
            expect(current?.device.device).toContain("Desktop"); // Heuristic fallback or parser result
            expect(current?.device.os).toContain("Mac OS");

            // Check other session
            const other = result.data?.find(s => !s.isCurrent);
            expect(other).toBeDefined();
            expect(other?.device.type).toBe("mobile");
            expect(other?.device.os).toContain("iOS");
        });

        it("should handle unauthorized access", async () => {
            (Auth.auth as any).mockResolvedValue(null);
            const result = await getActiveSessionsAction();
            expect(result.success).toBe(false);
            expect(result.error).toBe("Unauthorized");
        });
    });

    describe("revokeSessionAction", () => {
        it("should delete session if owned by user", async () => {
            (db.query.sessions.findFirst as any).mockResolvedValue({
                sessionToken: "target-session",
                userId: mockUserId
            });

            const result = await revokeSessionAction("target-session");

            expect(result.success).toBe(true);
            expect(db.delete).toHaveBeenCalled();
        });

        it("should fail if session does not belong to user", async () => {
            (db.query.sessions.findFirst as any).mockResolvedValue(null); // Not found or no match

            const result = await revokeSessionAction("target-session");

            expect(result.success).toBe(false);
            expect(db.delete).not.toHaveBeenCalled();
        });
    });
});
