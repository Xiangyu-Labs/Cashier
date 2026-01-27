import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { ledgers, receipts, transactions, categories } from "@/lib/db/schema";
import { processReceiptQueue } from "@/lib/queue";
import { eq } from "drizzle-orm";
import * as processorModule from "@/lib/message-processor/processor";

// Mock the processor
const mockProcess = vi.fn();
vi.spyOn(processorModule, "getMessageProcessor").mockReturnValue({
    process: mockProcess
});

describe("Auto-recognize Transaction Time", () => {
    let ledgerId: string;


    beforeEach(async () => {
        // Clear DB
        await db.delete(transactions);
        await db.delete(receipts);
        await db.delete(categories);
        await db.delete(ledgers);

        // Create Ledger
        const [ledger] = await db
            .insert(ledgers)
            .values({
                name: "Test Ledger",
                autoConfirm: true, // Auto-confirm enabled to simplify test
                autoRecognizeDate: false // Default to false
            })
            .returning();
        ledgerId = ledger.id;

        // Create Category
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

        mockProcess.mockResolvedValueOnce({
            rawResponse: "Bought food",
            transactions: [{
                amount: 100,
                currency: "CNY",
                itemName: "Lunch",
                category: "Food",
                transactionDate: pastDate
            }]
        });

        // Insert Receipt
        const [receipt] = await db.insert(receipts).values({
            ledgerId,
            text: "Lunch 100",
            status: "queued"
        }).returning();

        // Process
        await processReceiptQueue();

        // Verify
        const txs = await db.query.transactions.findMany({
            where: eq(transactions.receiptId, receipt.id)
        });

        expect(txs).toHaveLength(1);
        // Should NOT be the past date, should be today (or effectively not the past date)
        // Since we can't easily check "today" exactly due to timezones in test env sometimes,
        // checking it is NOT the pastDate is a strong signal if the logic works.
        // But better: check if it matches "today"
        const txDate = txs[0].transactionDate ? new Date(txs[0].transactionDate).toISOString().split('T')[0] : "";
        expect(txDate).not.toBe(pastDate);
        expect(txDate).toBe(today);
    });

    it("should use AI date when autoRecognizeDate is TRUE", async () => {
        // Setup: autoRecognizeDate = TRUE
        await db.update(ledgers).set({ autoRecognizeDate: true }).where(eq(ledgers.id, ledgerId));

        // Mock AI response with a specific date in the past
        const pastDate = "2023-01-01";

        mockProcess.mockResolvedValueOnce({
            rawResponse: "Bought food",
            transactions: [{
                amount: 100,
                currency: "CNY",
                itemName: "Lunch",
                category: "Food",
                transactionDate: pastDate
            }]
        });

        // Insert Receipt
        const [receipt] = await db.insert(receipts).values({
            ledgerId,
            text: "Old Lunch 100",
            status: "queued"
        }).returning();

        // Process
        await processReceiptQueue();

        // Verify
        const txs = await db.query.transactions.findMany({
            where: eq(transactions.receiptId, receipt.id)
        });

        expect(txs).toHaveLength(1);
        const txDate = txs[0].transactionDate ? new Date(txs[0].transactionDate).toISOString().split('T')[0] : "";
        expect(txDate).toBe(pastDate);
    });
});
