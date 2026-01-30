import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ledgers/[id]/source-documents/[docId]/shares/route";
import { GET as GET_SHARE } from "@/app/api/s/[shareId]/route";
import { DELETE } from "@/app/api/ledgers/[id]/source-documents/[docId]/shares/[shareId]/route";
import { getTestDb } from "../../setup";
import { ledgers, sourceDocuments, shares, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock API route for DELETE since it wasn't requested?
// Wait, I didn't create the DELETE route file yet! I missed it in the plan/execution.
// I added `deleteShare` to `api.ts`, but didn't create the route file `src/app/api/ledgers/[id]/source-documents/[docId]/shares/[shareId]/route.ts`.
// I need to create that route first before testing it.
// Let's implement the test for creating and fetching share first.

describe("Share API", () => {

    it("should create a share link", async () => {
        const db = getTestDb();
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger 1" }).returning();
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledger.id,
            title: "Test Receipt 1",
            text: "Coffee",
            status: "completed"
        }).returning();

        const request = new NextRequest(`http://localhost/api/ledgers/${ledger.id}/source-documents/${doc.id}/shares`, {
            method: "POST",
            body: JSON.stringify({ expiresIn: "7d" }),
        });

        const paramsPromise = Promise.resolve({ id: ledger.id, docId: doc.id });
        const response = await POST(request, { params: paramsPromise });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        expect(data.shareUrl).toContain(`/s/${data.id}`);
        expect(data.expiresAt).toBeDefined();
    });

    it("should fetch active share data", async () => {
        const db = getTestDb();
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger 2" }).returning();
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledger.id,
            title: "Test Receipt 2",
            text: "Coffee 25",
            status: "completed"
        }).returning();

        // Add some entries
        await db.insert(ledgerEntries).values({
            ledgerId: ledger.id,
            sourceDocumentId: doc.id,
            amount: "25.00",
            currency: "CNY",
            itemName: "Coffee",
            entryDate: new Date(),
        });

        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            isActive: true,
            accessCount: 0
        }).returning();

        const paramsPromise = Promise.resolve({ shareId: share.id });
        const request = new NextRequest(`http://localhost/api/s/${share.id}`);
        const response = await GET_SHARE(request, { params: paramsPromise });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.sourceDocument.id).toBe(doc.id);
        expect(data.entries).toHaveLength(1);
        expect(data.entries[0].itemName).toBe("Coffee");

        // Verify access count incremented
        const updatedShare = await db.query.shares.findFirst({ where: eq(shares.id, share.id) });
        expect(updatedShare?.accessCount).toBe(1);
    });

    it("should return 410 for expired share", async () => {
        const db = getTestDb();
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger 3" }).returning();
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledger.id,
            title: "Test Receipt 3",
            text: "Coffee",
            status: "completed"
        }).returning();

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            isActive: true,
            expiresAt: yesterday,
            accessCount: 0
        }).returning();

        const paramsPromise = Promise.resolve({ shareId: share.id });
        const request = new NextRequest(`http://localhost/api/s/${share.id}`);
        const response = await GET_SHARE(request, { params: paramsPromise });

        expect(response.status).toBe(410);
    });
});
