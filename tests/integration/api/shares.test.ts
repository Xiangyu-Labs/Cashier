import { describe, it, expect } from "vitest";
import { createShareAction, getPublicShareAction, deleteShareAction } from "@/features/ledger/server/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, shares, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Share Actions", () => {

    it("should create a share link", async () => {
        const db = getTestDb();
        const { ledgerId, userId: _userId } = await createTestUserWithLedger(db, "test1@example.com", "Test Ledger 1");

        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId,
            title: "Test Receipt 1",
            text: "Coffee",
            status: "completed"
        }).returning();

        const result = await createShareAction(ledgerId, doc.id, { expiresIn: "7d" });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.id).toBeDefined();
        expect(result.data?.shareUrl).toContain(`/s/${result.data?.id}`);
        expect(result.data?.expiresAt).toBeDefined();

        // Verify in DB
        const savedShare = await db.query.shares.findFirst({
            where: eq(shares.id, result.data!.id)
        });
        expect(savedShare).toBeDefined();
        expect(savedShare?.sourceDocumentId).toBe(doc.id);
    });

    it("should fetch active share data via public action", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test2@example.com", "Test Ledger 2");

        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId,
            title: "Test Receipt 2",
            text: "Coffee 25",
            status: "completed"
        }).returning();

        // Add some entries
        await db.insert(ledgerEntries).values({
            ledgerId: ledgerId,
            sourceDocumentId: doc.id,
            amount: "25.00",
            currency: "CNY",
            itemName: "Coffee",
            entryDate: new Date(),
        });

        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            ledgerId: ledgerId,
            isActive: true,
            accessCount: 0
        }).returning();

        // Public Action (no auth required implicit in the action logic, but we test the function)
        const result = await getPublicShareAction(share.id);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.sourceDocument.id).toBe(doc.id);
        expect(result.data?.entries).toHaveLength(1);
        expect(result.data?.entries[0].itemName).toBe("Coffee");

        // Verify access count incremented
        const updatedShare = await db.query.shares.findFirst({ where: eq(shares.id, share.id) });
        expect(updatedShare?.accessCount).toBe(1);
    });

    it("should return 410 for expired share", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test3@example.com", "Test Ledger 3");

        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId,
            title: "Test Receipt 3",
            text: "Coffee",
            status: "completed"
        }).returning();

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            ledgerId: ledgerId,
            isActive: true,
            expiresAt: yesterday,
            accessCount: 0
        }).returning();

        const result = await getPublicShareAction(share.id);

        expect(result.success).toBe(false);
        expect(result.status).toBe(410);
        expect(result.error).toContain("expired");
    });

    it("should delete share link", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test4@example.com", "Test Ledger 4");

        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId,
            title: "Test Receipt 4",
            text: "Coffee",
            status: "completed"
        }).returning();

        // Create share directly
        const [share] = await db.insert(shares).values({
            sourceDocumentId: doc.id,
            ledgerId: ledgerId,
            isActive: true,
        }).returning();

        // Delete via Action
        const result = await deleteShareAction(ledgerId, doc.id, share.id);

        expect(result.success).toBe(true);

        const deletedShare = await db.query.shares.findFirst({
            where: eq(shares.id, share.id)
        });
        expect(deletedShare).toBeUndefined();
    });
});
