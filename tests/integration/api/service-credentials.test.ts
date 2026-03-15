import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as ledgerEntryPOST } from "@/app/api/v1/source-documents/route";
import { getTestDb } from "../../setup";
import { serviceCredentials, sourceDocuments, ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { createServiceCredentialAction, deleteServiceCredentialAction, getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";

// Mock Processing
vi.mock("@/lib/processing", () => ({
    createProcessingTask: vi.fn(),
    createTask: vi.fn(),
}));

// Mock Flow Engine
vi.mock("@/lib/flow", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/flow")>();
    return {
        ...original,
        flowEngine: {
            ...original.flowEngine,
            submit: vi.fn().mockResolvedValue("mock-task-id"),
        },
    };
});

// Mock Tasks
vi.mock("@/features/source-document/server/tasks/parse-source-document", () => ({
    TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
}));

describe("Service Credentials & Ledger Entry Ingestion", () => {
    let testLedgerId: string;

    beforeEach(async () => {
        const db = getTestDb();

        await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
        const { ledgerId } = await createTestUserWithLedger(db, undefined, "API Test Ledger", TEST_USER_ID);
        testLedgerId = ledgerId;
    });

    it("should create and list service credentials via Actions", async () => {
        // Create Credential - new format returns data directly
        const createRes = await createServiceCredentialAction(testLedgerId, { name: "Test Credential" });

        expect(createRes).toBeDefined();
        expect(createRes.key).toBeDefined();
        expect(createRes.name).toBe("Test Credential");

        // List Credentials
        const listRes = await getServiceCredentialsAction(testLedgerId);

        expect(listRes).toHaveLength(1);
        expect(listRes[0].id).toBe(createRes.id);
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
            "http://localhost/api/v1/source-documents",
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
            "http://localhost/api/v1/source-documents",
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

        // deleteServiceCredentialAction returns void in new format
        await deleteServiceCredentialAction(testLedgerId, c.id);

        const check = await db.query.serviceCredentials.findFirst({
            where: eq(serviceCredentials.id, c.id)
        });
        expect(check).toBeDefined();
        expect(check?.deletedAt).not.toBeNull();
    });
});
