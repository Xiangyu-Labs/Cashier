import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, ParseSourceDocumentOutput } from "@/features/source-document/server/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { FlowContext, AIContext } from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";

// Mock the arbitration module
vi.mock("@/features/ai/server/services/arbitration", () => ({
    arbitrate: vi.fn(),
}));

import { arbitrate } from "@/features/ai/server/services/arbitration";

// Helper to create mock AI context
function createMockAI(responses: Array<{ content: string }>): AIContext {
    let callIndex = 0;
    return {
        generate: vi.fn().mockImplementation(() => {
            const response = responses[callIndex] || responses[responses.length - 1];
            callIndex++;
            return Promise.resolve(response);
        }),
    };
}

// Helper to create a valid AI response
function createAIResponse(entries: Array<{ itemName: string; amount: number; currency: string; category: string; entryDate: string }>, isValid = true, title?: string) {
    return JSON.stringify({
        is_valid: isValid,
        title,
        ledger_entries: entries.map(e => ({
            item_name: e.itemName,
            amount: e.amount,
            currency: e.currency,
            category: e.category,
            entry_date: e.entryDate,
            notes: null,
        })),
    });
}

describe("parseSourceDocumentHandler.execute", () => {
    let sourceDocId: string;
    let categoryId: string;
    let currentLedgerId: string;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Setup real DB data
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        currentLedgerId = ledgerId;
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            status: "processing"
        }).returning();
        const [category] = await db.insert(entryCategories).values({
            ledgerId,
            name: "Food",
            description: "Food stuff"
        }).returning();

        sourceDocId = sourceDoc.id;
        categoryId = category.id;
    });

    it("should parse entries using context.ai and return results", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            aiLanguage: "en-US",
            preferredCurrencies: ["USD"],
            settings: {
                autoRecognizeDate: true,
            }
        };

        const aiResponse = createAIResponse([
            { itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }
        ], true, "Test Title");

        const mockAI = createMockAI([{ content: aiResponse }, { content: aiResponse }]);

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        expect(mockAI.generate).toHaveBeenCalledTimes(2); // Dual GPT
        expect(result.ledgerEntries).toHaveLength(1);
        expect(result.title).toBe("Test Title");
        expect(result.verificationStatus).toBe("passed");
    });

    it("should override entryDate if autoRecognizeDate is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                autoRecognizeDate: false,
            }
        };

        const aiResponse = createAIResponse([
            { itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2020-01-01" }
        ]);

        const mockAI = createMockAI([{ content: aiResponse }, { content: aiResponse }]);

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        const today = new Date().toISOString().split("T")[0];
        expect(result.ledgerEntries[0].entryDate).toBe(today);
    });

    it("should return invalid status if isValid is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                autoRecognizeDate: true,
            }
        };

        const aiResponse = createAIResponse([], false);
        const mockAI = createMockAI([{ content: aiResponse }, { content: aiResponse }]);

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        expect(result.ledgerEntries).toHaveLength(0);
        expect(result.verificationStatus).toBe("invalid");
    });

    it("should invoke arbitration when dual GPT results don't match", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                autoRecognizeDate: true,
            }
        };

        // First call returns 10, second call returns 15 (mismatch)
        const response1 = createAIResponse([{ itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }]);
        const response2 = createAIResponse([{ itemName: "Lunch", amount: 15, currency: "USD", category: "Food", entryDate: "2024-01-01" }]);

        const mockAI = createMockAI([{ content: response1 }, { content: response2 }]);

        // Arbitration chooses result 1
        vi.mocked(arbitrate).mockResolvedValue({ choice: 1 });

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        expect(arbitrate).toHaveBeenCalledWith("total_mismatch", expect.anything(), expect.anything(), undefined, undefined, undefined, undefined, mockAI);
        expect(result.verificationStatus).toBe("passed");
        expect(result.ledgerEntries[0].amount).toBe(10);
    });

    it("should return anomaly when arbitration determines genuine ambiguity", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                autoRecognizeDate: true,
            }
        };

        const response1 = createAIResponse([{ itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }]);
        const response2 = createAIResponse([{ itemName: "Lunch", amount: 15, currency: "USD", category: "Food", entryDate: "2024-01-01" }]);

        const mockAI = createMockAI([{ content: response1 }, { content: response2 }]);

        // Arbitration says it's genuinely ambiguous
        vi.mocked(arbitrate).mockResolvedValue({ choice: 0, reason: "Amount unclear in receipt" });

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        expect(result.verificationStatus).toBe("anomaly");
        expect(result.anomalyReason).toBe("Amount unclear in receipt");
        expect(result.ledgerEntries).toHaveLength(0);
    });

    it("should accept arbitrated currency when unknown currency is resolved", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                autoRecognizeDate: true,
            }
        };

        const aiResponse = createAIResponse([
            { itemName: "Lunch", amount: 10, currency: "unknown", category: "Food", entryDate: "2024-01-01" }
        ], true, "Test Title");

        const mockAI = createMockAI([{ content: aiResponse }, { content: aiResponse }]);

        // Arbitration chooses result 1 and provides currency
        vi.mocked(arbitrate).mockResolvedValue({ choice: 1, currency: "CNY" });

        const context = {
            updateProgress: vi.fn(),
            ledgerId: currentLedgerId,
            signal: { aborted: false },
            ai: mockAI,
            reportTokens: vi.fn(),
        } as unknown as FlowContext;

        const result = await parseSourceDocumentHandler.execute(input, context);

        expect(arbitrate).toHaveBeenCalledWith("unknown_currency", expect.anything(), expect.anything(), undefined, undefined, undefined, undefined, mockAI);
        expect(result.verificationStatus).toBe("passed");
        expect(result.ledgerEntries[0].currency).toBe("CNY");
    });
});

describe("parseSourceDocumentHandler.onComplete", () => {
    it("should NOT save entries when status is anomaly", async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, `test-anomaly-${Date.now()}@example.com`, "Test Ledger");
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: {
                autoRecognizeDate: true
            }
        };

        const output: ParseSourceDocumentOutput = {
            ledgerEntries: [],
            title: "Test Title",
            anomalyReason: "Currency unidentifiable",
            verificationStatus: 'anomaly'
        };

        const context = {
            id: "task-1",
            type: "parse_source_document",
            ledgerId,
        };

        await parseSourceDocumentHandler.onComplete!(output, input, context as unknown as FlowContext);

        // Verify NO entries were created
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDoc.id)
        });
        expect(entries).toHaveLength(0);

        // Verify source document status is anomaly with reason in title
        const updatedSourceDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });
        expect(updatedSourceDoc?.status).toBe("anomaly");
        expect(updatedSourceDoc?.title).toBe("Currency unidentifiable");
    });

    it("should save entries and use 'completed' status if verification passed", async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, `test-completed-${Date.now()}@example.com`, "Test Ledger");
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId, status: "processing" }).returning();
        const [category] = await db.insert(entryCategories).values({ ledgerId, name: "餐饮", description: "餐饮" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [{ id: category.id, name: "餐饮", description: "餐饮" }],
            settings: {
                autoRecognizeDate: true
            }
        };

        const output: ParseSourceDocumentOutput = {
            ledgerEntries: [
                {
                    itemName: "Item 1",
                    amount: 100,
                    currency: "CNY",
                    category: "餐饮",
                    entryDate: "2024-01-01",
                    notes: null
                }
            ],
            verificationStatus: 'passed'
        };

        const context = {
            id: "task-2",
            type: "parse_source_document",
            ledgerId,
        };

        await parseSourceDocumentHandler.onComplete!(output, input, context as unknown as FlowContext);

        // Verify entries were created
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDoc.id)
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].itemName).toBe("Item 1");

        // Verify source document status
        const updatedSourceDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });
        expect(updatedSourceDoc?.status).toBe("completed");
    });

    it("should be idempotent (not create duplicates) if called multiple times", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, `idemp-${Date.now()}@example.com`, "Idemp Ledger");
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId,
            status: "processing"
        }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: { autoRecognizeDate: true }
        };

        const output: ParseSourceDocumentOutput = {
            ledgerEntries: [
                {
                    itemName: "Item 1",
                    amount: 100,
                    currency: "CNY",
                    category: null,
                    entryDate: "2024-01-01",
                    notes: null
                }
            ],
            verificationStatus: 'passed'
        };

        const context = {
            id: "task-idempotent",
            type: "parse_source_document",
            ledgerId,
        };

        // 1. First call
        await parseSourceDocumentHandler.onComplete!(output, input, context as unknown as FlowContext);

        // 2. Second call
        await parseSourceDocumentHandler.onComplete!(output, input, context as unknown as FlowContext);

        // 3. Verify
        const entries = await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.sourceDocumentId, sourceDoc.id),
                isNull(ledgerEntries.deletedAt)
            )
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].itemName).toBe("Item 1");
    });
});
