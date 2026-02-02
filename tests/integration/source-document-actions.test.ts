import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import { getTestDb } from "../setup";
import { ledgers, sourceDocuments, users } from "@/lib/db/schema";
import { createLedgerData, createSourceDocumentData } from "../helpers/factories";
import { v4 as uuidv4 } from "uuid";

// Mock auth module
vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("getSourceDocumentByIdAction", () => {
    // const db = getTestDb();
    const testUserId = "00000000-0000-0000-0000-000000000000";

    beforeEach(() => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: testUserId, email: "test@example.com" }
        } as any);
    });

    it("should return the source document when it exists and user has access", async () => {
        const db = getTestDb();
        // 1. Create Ledger
        const ledgerData = createLedgerData({ userId: testUserId });
        await db.insert(ledgers).values(ledgerData);

        // 2. Create Source Document
        const docData = createSourceDocumentData(ledgerData.id);
        await db.insert(sourceDocuments).values(docData);

        // 3. Action
        const result = await getSourceDocumentByIdAction(docData.id);

        // 4. Assertion
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        if (result.success && result.data) {
            expect(result.data.id).toBe(docData.id);
            expect(result.data.ledgerId).toBe(ledgerData.id);
            // Verify date serialization
            expect(typeof result.data.createdAt).toBe("string");
        }
    });


    it("should return error when document does not exist", async () => {
        const result = await getSourceDocumentByIdAction(uuidv4());
        expect(result.success).toBe(false);
        expect(result.error).toContain("Document not found");
    });

    it("should return error when user does not have access to the ledger", async () => {
        const db = getTestDb();
        // 1. Create Ledger for ANOTHER user
        const otherUserId = "22222222-2222-2222-2222-222222222222";
        await db.insert(users).values({
            id: otherUserId,
            email: "other2@example.com",
            name: "Other User 2",
            emailVerified: new Date()
        }).onConflictDoNothing();

        const ledgerData = createLedgerData({ userId: otherUserId });
        await db.insert(ledgers).values(ledgerData);

        // 2. Create Source Document
        const docData = createSourceDocumentData(ledgerData.id);
        await db.insert(sourceDocuments).values(docData);

        // 3. Action
        const result = await getSourceDocumentByIdAction(docData.id);

        // 4. Assertion
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
