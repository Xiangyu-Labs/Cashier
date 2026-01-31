import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, ParseSourceDocumentOutput } from "@/lib/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FlowContext } from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";

// Mock the processor and utils
vi.mock("@/lib/message-processor/processor", () => ({
    getSourceDocumentProcessor: vi.fn(),
}));

vi.mock("@/lib/message-processor/utils", () => ({
    summarizeLedgerEntries: vi.fn(),
}));

vi.mock("@/lib/ai/arbitration", () => ({
    arbitrate: vi.fn(),
}));

import { getSourceDocumentProcessor } from "@/lib/message-processor/processor";
import { summarizeLedgerEntries } from "@/lib/message-processor/utils";
import { arbitrate } from "@/lib/ai/arbitration";

describe("parseSourceDocumentHandler.execute", () => {
    let mockProcessor: { process: ReturnType<typeof vi.fn> };
    let sourceDocId: string;
    let categoryId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockProcessor = {
            process: vi.fn(),
        };
        // Mock processor to return identical results for dual call by default
        vi.mocked(getSourceDocumentProcessor).mockReturnValue(mockProcessor as unknown as never);

        // Setup real DB data
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        const ledger = { id: ledgerId };
        const [sourceDoc] = await db.insert(sourceDocuments).values({
            ledgerId: ledger.id,
            status: "processing"
        }).returning();
        const [category] = await db.insert(entryCategories).values({
            ledgerId: ledger.id,
            name: "Food",
            description: "Food stuff"
        }).returning();

        sourceDocId = sourceDoc.id;
        categoryId = category.id;
    });

    it("should pass settings and preferredCurrencies correctly to the processor", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            aiLanguage: "en-US",
            preferredCurrencies: ["USD"],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: true,
            }
        };

        mockProcessor.process.mockResolvedValue({
            ledgerEntries: [
                { itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }
            ],
            isValid: true,
            title: "Test Title"
        });

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(mockProcessor.process).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                categories: input.categories,
                aiLanguage: "en-US",
                preferredCurrencies: ["USD"],
            })
        );
        expect(result.ledgerEntries).toHaveLength(1);
        expect(result.title).toBe("Test Title");
    });

    it("should override entryDate if autoRecognizeDate is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: false,
            }
        };

        mockProcessor.process.mockResolvedValue({
            ledgerEntries: [
                { itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2020-01-01" }
            ],
            isValid: true
        });

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        const today = new Date().toISOString().split("T")[0];
        expect(result.ledgerEntries[0].entryDate).toBe(today);
    });

    it("should call summarizeLedgerEntries if mergeSimilarItems is true", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: true,
                autoRecognizeDate: true,
            }
        };

        mockProcessor.process.mockResolvedValue({
            ledgerEntries: [
                { itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" },
                { itemName: "Dinner", amount: 20, currency: "USD", category: "Food", entryDate: "2024-01-01" }
            ],
            isValid: true
        });

        vi.mocked(summarizeLedgerEntries).mockResolvedValue([
            { itemName: "Summary", amount: 30, currency: "USD", category: "Food", entryDate: "2024-01-01" }
        ]);

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(summarizeLedgerEntries).toHaveBeenCalled();
        expect(result.ledgerEntries).toHaveLength(1);
        expect(result.ledgerEntries[0].itemName).toBe("Summary");
    });

    it("should return empty ledgerEntries if isValid is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: true,
            }
        };

        mockProcessor.process.mockResolvedValue({
            ledgerEntries: [],
            isValid: false
        });

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(result.ledgerEntries).toHaveLength(0);
        expect(result.verificationStatus).toBe("invalid");
    });

    it("should invoke arbitration when dual GPT results don't match", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: true,
            }
        };

        // First call returns 10, second call returns 15 (mismatch)
        mockProcessor.process
            .mockResolvedValueOnce({
                ledgerEntries: [{ itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }],
                isValid: true
            })
            .mockResolvedValueOnce({
                ledgerEntries: [{ itemName: "Lunch", amount: 15, currency: "USD", category: "Food", entryDate: "2024-01-01" }],
                isValid: true
            });

        // Arbitration chooses result 1
        vi.mocked(arbitrate).mockResolvedValue({ choice: 1 });

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(arbitrate).toHaveBeenCalledWith("total_mismatch", expect.anything(), expect.anything(), undefined, undefined);
        expect(result.verificationStatus).toBe("passed");
        expect(result.ledgerEntries[0].amount).toBe(10); // First result chosen
    });

    it("should return anomaly when arbitration determines genuine ambiguity", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: true,
            }
        };

        mockProcessor.process
            .mockResolvedValueOnce({
                ledgerEntries: [{ itemName: "Lunch", amount: 10, currency: "USD", category: "Food", entryDate: "2024-01-01" }],
                isValid: true
            })
            .mockResolvedValueOnce({
                ledgerEntries: [{ itemName: "Lunch", amount: 15, currency: "USD", category: "Food", entryDate: "2024-01-01" }],
                isValid: true
            });

        // Arbitration says it's genuinely ambiguous
        vi.mocked(arbitrate).mockResolvedValue({ choice: 0, reason: "Amount unclear in receipt" });

        const context = {
            updateProgress: vi.fn(),
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(result.verificationStatus).toBe("anomaly");
        expect(result.anomalyReason).toBe("Amount unclear in receipt");
        expect(result.ledgerEntries).toHaveLength(0);
    });

    it("should accept arbitrated currency when unknown currency is resolved", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDocId,
            categories: [{ id: categoryId, name: "Food", description: "Food stuff" }],
            settings: {
                mergeSimilarItems: false,
                autoRecognizeDate: true,
            }
        };

        mockProcessor.process.mockResolvedValue({
            ledgerEntries: [
                { itemName: "Lunch", amount: 10, currency: "unknown", category: "Food", entryDate: "2024-01-01" }
            ],
            isValid: true,
            title: "Test Title"
        });

        // Arbitration chooses result 1 and provides currency
        vi.mocked(arbitrate).mockResolvedValue({ choice: 1, currency: "CNY" });

        const context = {
            updateProgress: vi.fn(),
            ledgerId: "test-ledger"
        } as unknown as FlowContext;

        const result = (await parseSourceDocumentHandler.execute(input, context)) as ParseSourceDocumentOutput;

        expect(arbitrate).toHaveBeenCalledWith("unknown_currency", expect.anything(), expect.anything(), undefined, undefined);
        expect(result.verificationStatus).toBe("passed");
        expect(result.ledgerEntries[0].currency).toBe("CNY");
    });
});

describe("parseSourceDocumentHandler.onComplete", () => {
    it("should NOT save entries when status is anomaly", async () => {
        const db = getTestDb();

        const { ledgerId } = await createTestUserWithLedger(db, "test1@example.com", "Test Ledger");
        const ledger = { id: ledgerId };
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: {
                mergeSimilarItems: false,
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
            ledgerId: ledger.id,
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

        const { ledgerId } = await createTestUserWithLedger(db, "test2@example.com", "Test Ledger");
        const ledger = { id: ledgerId };
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();
        const [category] = await db.insert(entryCategories).values({ ledgerId: ledger.id, name: "餐饮", description: "餐饮" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [{ id: category.id, name: "餐饮", description: "餐饮" }],
            settings: {
                mergeSimilarItems: false,
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
            ledgerId: ledger.id,
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

        const { ledgerId } = await createTestUserWithLedger(db, "test3@example.com", "Test Ledger");
        const ledger = { id: ledgerId };
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();

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
            ledgerId: ledger.id,
            input: {
                sourceDocumentId: sourceDoc.id,
                categories: [],
                settings: { mergeSimilarItems: false, autoRecognizeDate: true }
            },
        };

        // 1. First call
        await parseSourceDocumentHandler.onComplete!(output, (context as unknown as { input: ParseSourceDocumentInput }).input, context as unknown as FlowContext);

        // 2. Second call
        await parseSourceDocumentHandler.onComplete!(output, (context as unknown as { input: ParseSourceDocumentInput }).input, context as unknown as FlowContext);

        // 3. Verify
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDoc.id)
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].itemName).toBe("Item 1");
    });
});
