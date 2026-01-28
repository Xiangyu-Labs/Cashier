import { describe, it, expect } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/lib/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { ledgers, sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("parseSourceDocumentHandler.onComplete", () => {
    it("should force 'pending' status if any entry has 'unknown' currency even if autoConfirm is true", async () => {
        const db = getTestDb();

        // 1. Setup ledger and source document
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger" }).returning();
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();
        const [category] = await db.insert(entryCategories).values({ ledgerId: ledger.id, name: "餐饮", description: "餐饮" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [{ id: category.id, name: "餐饮", description: "餐饮" }],
            settings: {
                autoConfirm: true,
                mergeSimilarItems: false,
                autoRecognizeDate: true
            }
        };

        const output = {
            ledgerEntries: [
                {
                    itemName: "Item 1",
                    amount: 100,
                    currency: "CNY",
                    category: "餐饮",
                    entryDate: "2024-01-01",
                    notes: null
                },
                {
                    itemName: "Item 2",
                    amount: 50,
                    currency: "unknown",
                    category: "餐饮",
                    entryDate: "2024-01-01",
                    notes: null
                }
            ]
        };

        const task = {
            id: "task-1",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId: ledger.id,
            input,
            status: "running" as const,
            createdAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
            error: null,
            metadata: null,
            entityId: null,
            entityType: null,
            progress: null,
            title: "Task 1",
        } as any;

        // 2. Execute onComplete
        await parseSourceDocumentHandler.onComplete!(output, task);

        // 3. Verify ledger entries status
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDoc.id)
        });

        expect(entries).toHaveLength(2);
        expect(entries[0].status).toBe("pending");
        expect(entries[1].status).toBe("pending");

        // 4. Verify source document status
        const updatedSourceDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });
        expect(updatedSourceDoc?.status).toBe("to_confirm");
    });

    it("should use 'confirmed' status if all entries have valid currency and autoConfirm is true", async () => {
        const db = getTestDb();

        // 1. Setup ledger and source document
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger" }).returning();
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();
        const [category] = await db.insert(entryCategories).values({ ledgerId: ledger.id, name: "餐饮", description: "餐饮" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [{ id: category.id, name: "餐饮", description: "餐饮" }],
            settings: {
                autoConfirm: true,
                mergeSimilarItems: false,
                autoRecognizeDate: true
            }
        };

        const output = {
            ledgerEntries: [
                {
                    itemName: "Item 1",
                    amount: 100,
                    currency: "CNY",
                    category: "餐饮",
                    entryDate: "2024-01-01",
                    notes: null
                }
            ]
        };

        const task = {
            id: "task-2",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId: ledger.id,
            input,
            status: "running" as const,
            createdAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
            error: null,
            metadata: null,
            entityId: null,
            entityType: null,
            progress: null,
            title: "Task 2",
        } as any;

        // 2. Execute onComplete
        await parseSourceDocumentHandler.onComplete!(output, task);

        // 3. Verify ledger entries status
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDoc.id)
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].status).toBe("confirmed");

        // 4. Verify source document status
        const updatedSourceDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });
        expect(updatedSourceDoc?.status).toBe("completed");
    });
});
