import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { ledgers, sourceDocuments, ledgerEntries, entryCategories as categories } from "@/lib/db/schema";
import { submitFlowTask } from "@/lib/flow/producer";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/lib/tasks/parse-source-document";
import { eq } from "drizzle-orm";
import * as processorModule from "@/lib/message-processor/processor";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

// Mock the processor
const mockProcess = vi.fn();
vi.spyOn(processorModule, "getSourceDocumentProcessor").mockReturnValue({
    process: mockProcess
} as ReturnType<typeof processorModule.getSourceDocumentProcessor>);

describe("Auto-recognize Ledger Entry Time", () => {
    let ledgerId: string;


    beforeEach(async () => {
        // Clear DB
        await db.delete(ledgerEntries);
        await db.delete(sourceDocuments);
        await db.delete(categories);
        await db.delete(ledgers);

        // Create Ledger using helper
        const result = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        ledgerId = result.ledgerId;

        // Ensure settings are correct for the test
        await db.update(ledgers)
            .set({ autoRecognizeDate: false })
            .where(eq(ledgers.id, ledgerId));

        // Create Category
        await db
            .insert(categories)
            .values({
                name: "Food",
                ledgerId: ledgerId,
                sortOrder: 1
            })
            .returning();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should use current date when autoRecognizeDate is FALSE, even if AI finds a date", async () => {
        // Setup: autoRecognizeDate = FALSE (default)
        // Mock AI response with a specific date in the past
        const pastDate = "2023-01-01";
        const today = new Date().toISOString().split('T')[0];

        mockProcess.mockResolvedValue({
            rawResponse: "Bought food",
            ledgerEntries: [{
                amount: 100,
                currency: "CNY",
                itemName: "Lunch",
                category: "Food",
                entryDate: pastDate
            }]
        });

        // Insert Source Document
        const [sourceDocument] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Lunch 100",
            status: "queued"
        }).returning();

        // Submit Flow Task
        await submitFlowTask({
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            title: "Test Task",
            ledgerId,
            data: {
                sourceDocumentId: sourceDocument.id,
                text: sourceDocument.text || undefined,
                categories: await db.query.entryCategories.findMany({ where: eq(categories.ledgerId, ledgerId) }),
                settings: {
                    autoRecognizeDate: false,
                    mergeSimilarItems: false
                }
            }
        });

        // Process
        const { processAllPendingTasks } = await import("../../helpers/processing");
        await processAllPendingTasks();

        // Verify
        const txs = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDocument.id)
        });

        expect(txs).toHaveLength(1);
        // Should NOT be the past date, should be today (or effectively not the past date)
        const txDate = txs[0].entryDate ? new Date(txs[0].entryDate).toISOString().split('T')[0] : "";
        expect(txDate).not.toBe(pastDate);
        expect(txDate).toBe(today);
    });

    it("should use AI date when autoRecognizeDate is TRUE", async () => {
        // Setup: autoRecognizeDate = TRUE
        await db.update(ledgers).set({ autoRecognizeDate: true }).where(eq(ledgers.id, ledgerId));

        // Mock AI response with a specific date in the past
        const pastDate = "2023-01-01";

        mockProcess.mockResolvedValue({
            rawResponse: "Bought food",
            ledgerEntries: [{
                amount: 100,
                currency: "CNY",
                itemName: "Lunch",
                category: "Food",
                entryDate: pastDate
            }]
        });

        // Insert Source Document
        const [sourceDocument2] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Old Lunch 100",
            status: "queued"
        }).returning();

        // Submit Flow Task
        await submitFlowTask({
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            title: "Test Task 2",
            ledgerId,
            data: {
                sourceDocumentId: sourceDocument2.id,
                text: sourceDocument2.text || undefined,
                categories: await db.query.entryCategories.findMany({ where: eq(categories.ledgerId, ledgerId) }),
                settings: {
                    autoRecognizeDate: true,
                    mergeSimilarItems: false
                }
            }
        });

        // Process
        const { processAllPendingTasks } = await import("../../helpers/processing");
        await processAllPendingTasks();

        // Verify
        const txs = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDocument2.id)
        });

        expect(txs).toHaveLength(1);
        const txDate = txs[0].entryDate ? new Date(txs[0].entryDate).toISOString().split('T')[0] : "";
        expect(txDate).toBe(pastDate);
    });
});
