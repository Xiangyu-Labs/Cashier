/**
 * Multi-User Isolation Tests
 *
 * These tests verify that users cannot access data belonging to other users.
 * This is critical for the security of the multi-user architecture.
 * 
 * Note: The API returns 404 (not 403) when accessing non-owned resources.
 * This is intentional security behavior - not revealing whether a ledger exists
 * to unauthorized users (security through obscurity).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import {
    TEST_USER_ID,
    createTestUserWithLedger,
} from "../../helpers/schema-setup";

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

    describe("GET /api/ledgers/[id]", () => {
        it("should deny access (404) when user1 tries to access user2 ledger", async () => {
            // User 1 (TEST_USER_ID) tries to access User 2's ledger
            // The global mock already returns TEST_USER_ID, so this should fail
            const { GET } = await import(
                "@/app/api/ledgers/[id]/route"
            );

            const request = new Request(`http://localhost/api/ledgers/${user2Ledger}`, {
                method: "GET",
            });

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            // Returns 404 to not reveal ledger existence to unauthorized users
            expect(response.status).toBe(404);
            const body = await response.json();
            expect(body.error).toBe("Ledger not found");
        });

        it("should return 200 when user1 accesses their own ledger", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/route"
            );

            const request = new Request(`http://localhost/api/ledgers/${user1Ledger}`, {
                method: "GET",
            });

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user1Ledger }),
            });

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.id).toBe(user1Ledger);
        });
    });

    describe("PATCH /api/ledgers/[id]", () => {
        it("should deny access (404) when user1 tries to update user2 ledger", async () => {
            const { PATCH } = await import(
                "@/app/api/ledgers/[id]/route"
            );

            const request = new Request(`http://localhost/api/ledgers/${user2Ledger}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Hacked Ledger" }),
            });

            const response = await PATCH(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("DELETE /api/ledgers/[id]", () => {
        it("should deny access (404) when user1 tries to delete user2 ledger", async () => {
            const { DELETE } = await import(
                "@/app/api/ledgers/[id]/route"
            );

            const request = new Request(`http://localhost/api/ledgers/${user2Ledger}`, {
                method: "DELETE",
            });

            const response = await DELETE(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("GET /api/ledgers/[id]/ledger-entries", () => {
        it("should deny access (404) when user1 tries to access user2 ledger entries", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/ledger-entries/route"
            );

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/ledger-entries`,
                { method: "GET" }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("GET /api/ledgers/[id]/source-documents", () => {
        it("should deny access (404) when user1 tries to access user2 source documents", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/source-documents/route"
            );

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/source-documents`,
                { method: "GET" }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("GET /api/ledgers/[id]/entry-categories", () => {
        it("should deny access (404) when user1 tries to access user2 entry categories", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/entry-categories/route"
            );

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/entry-categories`,
                { method: "GET" }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("GET /api/ledgers/[id]/service-credentials", () => {
        it("should deny access (404) when user1 tries to access user2 service credentials", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/service-credentials/route"
            );

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/service-credentials`,
                { method: "GET" }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("GET /api/ledgers/[id]/ledger-entries/summary", () => {
        it("should deny access (404) when user1 tries to access user2 ledger summary", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/ledger-entries/summary/route"
            );

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/ledger-entries/summary`,
                { method: "GET" }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);
        });
    });

    describe("SSE /api/ledgers/[id]/events", () => {
        it("should deny access (404) when user1 tries to subscribe to user2 ledger events", async () => {
            const { GET } = await import(
                "@/app/api/ledgers/[id]/events/route"
            );

            // Create an AbortController for the signal
            const abortController = new AbortController();

            const request = new Request(
                `http://localhost/api/ledgers/${user2Ledger}/events`,
                { method: "GET", signal: abortController.signal }
            );

            const response = await GET(request as any, {
                params: Promise.resolve({ id: user2Ledger }),
            });

            expect(response.status).toBe(404);

            // Clean up
            abortController.abort();
        });
    });
});
