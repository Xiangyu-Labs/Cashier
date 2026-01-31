
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/s/[shareId]/route";
import { getTestDb } from "../../setup";
import { sourceDocuments, shares } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Share API Security", () => {
    it("should strictly return only allowed fields for source document", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "share-security@example.com", "Share Ledger");

        // Create a source document with extra "internal" fields if the schema allowed it,
        // but since we are testing the API response shape, we rely on the DB insertion.
        // We'll insert a standard document.
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId,
            title: "Sensitive Receipt",
            text: "Content",
            status: "completed",
            // anomalyCodes is a field we definitely do NOT want to leak if it contains sensitive debug info
            anomalyCodes: ["debug_error_code_123"]
        }).returning();

        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            isActive: true,
        }).returning();

        const request = new NextRequest(`http://localhost/api/s/${share.id}`);
        const params = Promise.resolve({ shareId: share.id });
        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);

        // Allowed fields
        expect(data.sourceDocument.id).toBe(doc.id);
        expect(data.sourceDocument.title).toBe("Sensitive Receipt");
        expect(data.sourceDocument.text).toBe("Content");
        expect(data.sourceDocument.imageUrls).toBeDefined();
        expect(data.sourceDocument.createdAt).toBeDefined();

        // Forbidden fields (Leaked data check)
        expect(data.sourceDocument.status).toBeUndefined();
        expect(data.sourceDocument.anomalyCodes).toBeUndefined();
        expect(data.sourceDocument.ledgerId).toBeUndefined(); // Should not leak parent ledger ID inside the doc object
        expect(data.ledgerId).toBeUndefined(); // Ideally shouldn't leak top level either, though plan said maybe optional. Let's enforce strictness.
    });
});
