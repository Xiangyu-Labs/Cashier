import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { ledgers, sourceDocuments, ledgerEntries, entryCategories as categories } from "@/lib/db/schema";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/features/source-document/server/tasks/parse-source-document";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

// Mock ai-context to return controlled responses
vi.mock("@/lib/flow/ai-context", () => ({
    createAIContext: vi.fn(() => ({
        generate: vi.fn(),
    })),
}));

import { createAIContext } from "@/lib/flow/ai-context";

// Helper to create a smart mock generate function that handles multi-stage AI calls
function createMultiStageGenerate(entry: { amount: number; currency: string; itemName: string; category: string; entryDate: string }) {
    return vi.fn().mockImplementation(({ prompt }: { prompt: string }) => {
        const promptLower = prompt.toLowerCase();

        // Stage 1.5: Validation
        if ((promptLower.includes('validation') && promptLower.includes('reviews')) || promptLower.includes('veto power')) {
            return Promise.resolve({
                content: JSON.stringify({
                    is_reasonable: true,
                    summary: {
                        title: "测试账单",
                        currencies: [{ code: entry.currency, hint: `Identified ${entry.currency}` }],
                        categories: [{ name: entry.category, hint: "Category matches content" }],
                        rules: []
                    }
                })
            });
        }

        // Stage 2: Detailed Parse
        if (promptLower.includes('detailed financial document parser') ||
            promptLower.includes('ledger_entries') ||
            promptLower.includes('pre-analysis context')) {
            return Promise.resolve({
                content: JSON.stringify({
                    ledger_entries: [{
                        item_name: entry.itemName,
                        amount: entry.amount,
                        currency: entry.currency,
                        category: entry.category,
                        entry_date: entry.entryDate,
                        notes: null
                    }],
                    reasoning: "Parsed expense entry"
                })
            });
        }

        // Stage 1.1: Validity
        if (promptLower.includes('validity') || promptLower.includes('valid financial')) {
            return Promise.resolve({
                content: JSON.stringify({ is_valid: true, reasoning: "Valid document" })
            });
        }

        // Stage 1.2: Completeness
        if (promptLower.includes('complete') || promptLower.includes('missing content')) {
            return Promise.resolve({
                content: JSON.stringify({ is_complete: true })
            });
        }

        // Stage 1.3: Currency
        if (promptLower.includes('currency') || promptLower.includes('currencies')) {
            return Promise.resolve({
                content: JSON.stringify({ currencies: [entry.currency], reasoning: `Detected ${entry.currency}` })
            });
        }

        // Stage 1.4: Category
        if (promptLower.includes('category') || promptLower.includes('categories')) {
            return Promise.resolve({
                content: JSON.stringify({ categories: [entry.category], reasoning: `Matched ${entry.category}` })
            });
        }

        // Stage 1.5: Title
        if (promptLower.includes('title') || promptLower.includes('concise summary')) {
            return Promise.resolve({
                content: JSON.stringify({ title: "测试账单" })
            });
        }

        // Arbitration
        if (promptLower.includes('arbitration')) {
            return Promise.resolve({
                content: JSON.stringify({ choice: 1, reason: "First result is acceptable" })
            });
        }

        // Default: Stage 2 response
        return Promise.resolve({
            content: JSON.stringify({
                ledger_entries: [{
                    item_name: entry.itemName,
                    amount: entry.amount,
                    currency: entry.currency,
                    category: entry.category,
                    entry_date: entry.entryDate,
                    notes: null
                }],
                reasoning: "Parsed expense entry"
            })
        });
    });
}

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
            .set({ metadata: { settings: { autoRecognizeDate: false } } })
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

        // Setup smart mock that handles multi-stage AI calls
        const mockGenerate = createMultiStageGenerate({
            amount: 100,
            currency: "CNY",
            itemName: "Lunch",
            category: "Food",
            entryDate: pastDate
        });
        vi.mocked(createAIContext).mockReturnValue({ generate: mockGenerate });

        // Insert Source Document
        const [sourceDocument] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Lunch 100",
            status: "queued"
        }).returning();

        // Submit Flow Task
        await flowEngine.submit(
            TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            {
                sourceDocumentId: sourceDocument.id,
                text: sourceDocument.text || undefined,
                categories: await db.query.entryCategories.findMany({ where: eq(categories.ledgerId, ledgerId) }),
                settings: {
                    autoRecognizeDate: false,
                }
            },
            { title: "Test Task", ledgerId }
        );

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
        await db.update(ledgers).set({ metadata: { settings: { autoRecognizeDate: true } } }).where(eq(ledgers.id, ledgerId));

        // Mock AI response with a specific date in the past
        const pastDate = "2023-01-01";

        // Setup smart mock that handles multi-stage AI calls
        const mockGenerate = createMultiStageGenerate({
            amount: 100,
            currency: "CNY",
            itemName: "Lunch",
            category: "Food",
            entryDate: pastDate
        });
        vi.mocked(createAIContext).mockReturnValue({ generate: mockGenerate });

        // Insert Source Document
        const [sourceDocument2] = await db.insert(sourceDocuments).values({
            ledgerId,
            text: "Old Lunch 100",
            status: "queued"
        }).returning();

        // Submit Flow Task
        await flowEngine.submit(
            TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            {
                sourceDocumentId: sourceDocument2.id,
                text: sourceDocument2.text || undefined,
                categories: await db.query.entryCategories.findMany({ where: eq(categories.ledgerId, ledgerId) }),
                settings: {
                    autoRecognizeDate: true,
                }
            },
            { title: "Test Task 2", ledgerId }
        );

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
