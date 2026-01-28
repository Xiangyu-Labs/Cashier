import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/lib/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { ledgers, sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mock the processor and utils
vi.mock("@/lib/message-processor/processor", () => ({
    getSourceDocumentProcessor: vi.fn(),
}));

vi.mock("@/lib/message-processor/utils", () => ({
    summarizeLedgerEntries: vi.fn(),
}));

import { getSourceDocumentProcessor } from "@/lib/message-processor/processor";
import { summarizeLedgerEntries } from "@/lib/message-processor/utils";

describe("parseSourceDocumentHandler.execute", () => {
    let mockProcessor: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockProcessor = {
            process: vi.fn(),
        };
        vi.mocked(getSourceDocumentProcessor).mockReturnValue(mockProcessor);
    });

    it("should pass settings and preferredCurrencies correctly to the processor", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: "doc-1",
            categories: [{ id: "c1", name: "Food", description: "Food stuff" }],
            language: "en-US",
            preferredCurrencies: ["USD"],
            settings: {
                autoConfirm: false,
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
        } as any;

        const result = await parseSourceDocumentHandler.execute({ input } as any, context);

        expect(mockProcessor.process).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                categories: input.categories,
                language: "en-US",
                preferredCurrencies: ["USD"],
            })
        );
        expect(result.ledgerEntries).toHaveLength(1);
        expect(result.title).toBe("Test Title");
    });

    it("should override entryDate if autoRecognizeDate is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: "doc-1",
            categories: [{ id: "c1", name: "Food", description: "Food stuff" }],
            settings: {
                autoConfirm: false,
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
        } as any;

        const result = await parseSourceDocumentHandler.execute({ input } as any, context);

        const today = new Date().toISOString().split("T")[0];
        expect(result.ledgerEntries[0].entryDate).toBe(today);
    });

    it("should call summarizeLedgerEntries if mergeSimilarItems is true", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: "doc-1",
            categories: [{ id: "c1", name: "Food", description: "Food stuff" }],
            settings: {
                autoConfirm: false,
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
        } as any;

        const result = await parseSourceDocumentHandler.execute({ input } as any, context);

        expect(summarizeLedgerEntries).toHaveBeenCalled();
        expect(result.ledgerEntries).toHaveLength(1);
        expect(result.ledgerEntries[0].itemName).toBe("Summary");
    });

    it("should return empty ledgerEntries if isValid is false", async () => {
        const input: ParseSourceDocumentInput = {
            sourceDocumentId: "doc-1",
            categories: [{ id: "c1", name: "Food", description: "Food stuff" }],
            settings: {
                autoConfirm: false,
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
        } as any;

        const result = await parseSourceDocumentHandler.execute({ input } as any, context);

        expect(result.ledgerEntries).toHaveLength(0);
    });
});

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
