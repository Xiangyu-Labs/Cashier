import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSourceDocumentAction, retrySourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, ledgerEntries, taskRuns, entryCategories as categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";
import { getOpenAIClient } from "@/features/ai/server/services/openai";
import { processAllPendingTasks } from "../../helpers/processing";

// Mock OpenAI
vi.mock("@/features/ai/server/services/openai", () => ({
    getOpenAIClient: vi.fn(),
}));

describe("SourceDocument Retry Action", () => {
    let testLedgerId: string;
    let testCategoryId: string;

    beforeEach(async () => {
        // Reset mock to default
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({ content: MOCK_RESPONSES.singleEntry }),
        } as unknown as ReturnType<typeof getOpenAIClient>);

        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        testLedgerId = ledgerId;

        // Setup "餐饮" category
        const [category] = await db
            .insert(categories)
            .values({
                name: "餐饮",
                description: "餐饮服务",
                sortOrder: 1,
                ledgerId: testLedgerId,
            })
            .returning();
        testCategoryId = category.id;
    });

    it("should retry a document and re-process it", async () => {
        // 1. Create a document
        const createRes = await createSourceDocumentAction(testLedgerId, { text: "Lunch 25" });
        const docId = createRes.sourceDocumentId!;

        // Process it
        await processAllPendingTasks();

        const db = getTestDb();
        const docBefore = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docBefore?.status).toBe("completed");

        // 2. Call retry with new text
        const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Dinner 50" });
        expect(retryRes.success).toBe(true);

        const docAfterRetry = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docAfterRetry?.status).toBe("queued");
        expect(docAfterRetry?.text).toBe("Dinner 50");

        // 3. Process tasks again
        await processAllPendingTasks();

        const docFinal = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docFinal?.status).toBe("completed");
    });

    it("should retry an anomaly document", async () => {
        // 1. Simulate an anomaly
        const db = getTestDb();
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            status: "anomaly",
            text: "Invalid data",
            anomalyCodes: ["invalid_content"],
        }).returning();
        const docId = doc.id;

        // 2. Retry it
        const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Fixed data" });
        expect(retryRes.success).toBe(true);

        const docAfterRetry = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docAfterRetry?.status).toBe("queued");

        // 3. Process
        await processAllPendingTasks();

        const docFinal = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });

        expect(docFinal?.status).toBe("completed");
    });
});
