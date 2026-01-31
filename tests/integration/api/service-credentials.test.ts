import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createCredentialPOST, GET as listCredentialsGET } from "@/app/api/ledgers/[id]/service-credentials/route";
import { DELETE as deleteCredentialDELETE } from "@/app/api/ledgers/[id]/service-credentials/[credentialId]/route";
import { POST as ledgerEntryPOST } from "@/app/api/v1/ledger-entries/route";
import { getTestDb } from "../../setup";
import { serviceCredentials, sourceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

// Mock Processing
vi.mock("@/lib/processing", () => ({
    createProcessingTask: vi.fn(),
    createTask: vi.fn(),
}));

// Mock Tasks
vi.mock("@/lib/tasks", () => ({
    TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
}));

describe("Service Credentials & Ledger Entry Ingestion", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "API Test Ledger");
        testLedgerId = ledgerId;
    });

    it("should create and list service credentials", async () => {
        // Create Credential
        const createReq = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/service-credentials`,
            {
                method: "POST",
                body: JSON.stringify({ name: "Test Credential" }),
            }
        );

        const createRes = await createCredentialPOST(createReq, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(createRes.status).toBe(201);
        const newCred = await createRes.json();
        expect(newCred.key).toBeDefined();
        expect(newCred.name).toBe("Test Credential");


        // List Credentials
        const listReq = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/service-credentials`
        );
        const listRes = await listCredentialsGET(listReq, {
            params: Promise.resolve({ id: testLedgerId }),
        });

        expect(listRes.status).toBe(200);
        const creds = await listRes.json();
        expect(creds).toHaveLength(1);
        expect(creds[0].id).toBe(newCred.id);
    });

    it("should ingest ledger entry with valid service credential", async () => {
        // Setup: create a credential first
        const db = getTestDb();
        const [c] = await db.insert(serviceCredentials).values({
            ledgerId: testLedgerId,
            name: "Ingest Credential",
            key: "sk_test_123"
        }).returning();

        const req = new NextRequest(
            "http://localhost/api/v1/ledger-entries",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${c.key}`
                },
                body: JSON.stringify({ text: "API Ledger Entry" })
            }
        );

        const res = await ledgerEntryPOST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.status).toBe("queued");

        // Check DB
        const doc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, data.sourceDocumentId)
        });
        expect(doc).toBeDefined();
        expect(doc?.text).toBe("API Ledger Entry");
        expect(doc?.ledgerId).toBe(testLedgerId);
    });

    it("should reject ledger entry with invalid service credential", async () => {
        const req = new NextRequest(
            "http://localhost/api/v1/ledger-entries",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer invalid_key`
                },
                body: JSON.stringify({ text: "API Ledger Entry" })
            }
        );

        const res = await ledgerEntryPOST(req);
        expect(res.status).toBe(401);
    });

    it("should delete service credential", async () => {
        const db = getTestDb();
        const [c] = await db.insert(serviceCredentials).values({
            ledgerId: testLedgerId,
            name: "Delete Credential",
            key: "sk_delete_123"
        }).returning();

        const req = new NextRequest(
            `http://localhost/api/ledgers/${testLedgerId}/service-credentials/${c.id}`,
            { method: "DELETE" }
        );

        const res = await deleteCredentialDELETE(req, {
            params: Promise.resolve({ id: testLedgerId, credentialId: c.id })
        });

        expect(res.status).toBe(204);

        const check = await db.query.serviceCredentials.findFirst({
            where: eq(serviceCredentials.id, c.id)
        });
        expect(check).toBeUndefined();
    });
});
