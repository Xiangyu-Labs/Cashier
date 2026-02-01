
import { describe, it, expect } from "vitest";
import { getPublicShareAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, shares } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Share Action Security", () => {
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
            ledgerId,
            isActive: true,
        }).returning();

        const result = await getPublicShareAction(share.id);

        expect(result.success).toBe(true);
        const data = result.data!;

        // Allowed fields
        expect(data.sourceDocument.id).toBe(doc.id);
        expect(data.sourceDocument.title).toBe("Sensitive Receipt");
        expect(data.sourceDocument.text).toBe("Content");
        expect(data.sourceDocument.imageUrls).toBeDefined();
        expect(data.sourceDocument.createdAt).toBeDefined();

        // Forbidden fields (Leaked data check)
        // Typescript might complain if we try to access undefined properties, so cast to any
        const docAsAny = data.sourceDocument as any;
        expect(docAsAny.status).toBeUndefined();
        expect(docAsAny.anomalyCodes).toBeUndefined();
        expect(docAsAny.ledgerId).toBeUndefined(); // Should not leak parent ledger ID inside the doc object

        // Ledger ID is returned at top level in current implementation
        expect(data.ledgerId).toBe(ledgerId);
    });
});
