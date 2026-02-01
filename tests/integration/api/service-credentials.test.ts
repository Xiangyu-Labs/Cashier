import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as ledgerEntryPOST } from "@/app/api/v1/ledger-entries/route";
import { getTestDb } from "../../setup";
import { serviceCredentials, sourceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { createServiceCredentialAction, deleteServiceCredentialAction, getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";

// Mock Processing
vi.mock("@/lib/processing", () => ({
    createProcessingTask: vi.fn(),
    createTask: vi.fn(),
}));

// Mock Tasks
vi.mock("@/lib/flow/producer", () => ({
    submitFlowTask: vi.fn(),
}));

// Mock Tasks
vi.mock("@/features/source-document/server/tasks/parse-source-document", () => ({
    TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
}));

describe("Service Credentials & Ledger Entry Ingestion", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "API Test Ledger");
        testLedgerId = ledgerId;
    });

    it("should create and list service credentials via Actions", async () => {
        // Create Credential
        const createRes = await createServiceCredentialAction(testLedgerId, { name: "Test Credential" });

        expect(createRes.success).toBe(true);
        expect(createRes.data).toBeDefined();
        expect(createRes.data?.key).toBeDefined();
        expect(createRes.data?.name).toBe("Test Credential");

        // List Credentials
        const listRes = await getServiceCredentialsAction(testLedgerId);

        expect(listRes).toHaveLength(1);
        expect(listRes[0].id).toBe(createRes.data!.id);
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

    it("should delete service credential via Action", async () => {
        const db = getTestDb();
        const [c] = await db.insert(serviceCredentials).values({
            ledgerId: testLedgerId,
            name: "Delete Credential",
            key: "sk_delete_123"
        }).returning();

        const result = await deleteServiceCredentialAction(testLedgerId, c.id);

        expect(result.success).toBe(true);

        const check = await db.query.serviceCredentials.findFirst({
            where: eq(serviceCredentials.id, c.id)
        });
        expect(check).toBeUndefined();
    });
});
