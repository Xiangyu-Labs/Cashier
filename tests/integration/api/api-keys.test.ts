import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createApiKeyPOST, GET as listApiKeysGET } from "@/app/api/ledgers/[id]/api-keys/route";
import { DELETE as deleteApiKeyDELETE } from "@/app/api/ledgers/[id]/api-keys/[keyId]/route";
import { POST as transactionPOST } from "@/app/api/v1/transactions/route";
import { getTestDb } from "../../setup";
import { ledgers, apiKeys, inputMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock Queue
vi.mock("@/lib/queue", () => ({
    processMessageQueue: vi.fn().mockResolvedValue(undefined),
}));

describe("API Keys & Transaction Ingestion", () => {
    let testLedgerId: string;
    let apiKey: string;
    let keyId: string;

    beforeEach(async () => {
        const db = getTestDb();

        const [ledger] = await db
            .insert(ledgers)
            .values({ name: "API Test Ledger" })
            .returning();
        testLedgerId = ledger.id;
    });

    it("should create and list api keys", async () => {
        // Create Key
        const createReq = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/api-keys`,
            {
                method: "POST",
                body: JSON.stringify({ name: "Test Key" }),
            }
        );

        const createRes = await createApiKeyPOST(createReq, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(createRes.status).toBe(201);
        const newKey = await createRes.json();
        expect(newKey.key).toBeDefined();
        expect(newKey.name).toBe("Test Key");

        apiKey = newKey.key;
        keyId = newKey.id;

        // List Keys
        const listReq = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/api-keys`
        );
        const listRes = await listApiKeysGET(listReq, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(listRes.status).toBe(200);
        const keys = await listRes.json();
        expect(keys).toHaveLength(1);
        expect(keys[0].id).toBe(newKey.id);
    });

    it("should ingest transaction with valid api key", async () => {
        // Setup: create a key first
        const db = getTestDb();
        const [k] = await db.insert(apiKeys).values({
            ledgerId: testLedgerId,
            name: "Ingest Key",
            key: "sk_test_123"
        }).returning();

        const req = new NextRequest(
            "http://localhost/api/v1/transactions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${k.key}`
                },
                body: JSON.stringify({ text: "API Transaction" })
            }
        );

        const res = await transactionPOST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.status).toBe("queued");

        // Check DB
        const msg = await db.query.inputMessages.findFirst({
            where: eq(inputMessages.id, data.messageId)
        });
        expect(msg).toBeDefined();
        expect(msg?.content).toBe("API Transaction");
        expect(msg?.ledgerId).toBe(testLedgerId);
    });

    it("should reject transaction with invalid api key", async () => {
        const req = new NextRequest(
            "http://localhost/api/v1/transactions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer invalid_key`
                },
                body: JSON.stringify({ text: "API Transaction" })
            }
        );

        const res = await transactionPOST(req);
        expect(res.status).toBe(401);
    });

    it("should delete api key", async () => {
        const db = getTestDb();
        const [k] = await db.insert(apiKeys).values({
            ledgerId: testLedgerId,
            name: "Delete Key",
            key: "sk_delete_123"
        }).returning();

        const req = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/api-keys/${k.id}`,
            { method: "DELETE" }
        );

        const res = await deleteApiKeyDELETE(req, {
            params: Promise.resolve({ id: testLedgerId, keyId: k.id })
        });

        expect(res.status).toBe(204);

        const check = await db.query.apiKeys.findFirst({
            where: eq(apiKeys.id, k.id)
        });
        expect(check).toBeUndefined();
    });
});
