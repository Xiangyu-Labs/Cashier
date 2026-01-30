import { describe, it, expect } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/lib/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { ledgers, sourceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FlowContext } from "@/lib/flow";

describe("parseSourceDocumentHandler.onError", () => {
    it("should map schema validation errors (zod) to 'invalid_content'", async () => {
        const db = getTestDb();
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger" }).returning();
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: { mergeSimilarItems: false, autoRecognizeDate: true }
        };

        const context = {
            id: "task-error-1",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId: ledger.id,
            input,
        } as unknown as FlowContext;

        const error = new Error("AI response schema validation failed: ledger_entries: Required");

        await expect(parseSourceDocumentHandler.onError!(error, input, context)).rejects.toThrow();

        const updatedDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });

        expect(updatedDoc?.status).toBe("anomaly");
        expect(updatedDoc?.anomalyCodes).toContain("invalid_content");
    });

    it("should map JSON parsing errors to 'parse_failed'", async () => {
        const db = getTestDb();
        const [ledger] = await db.insert(ledgers).values({ name: "Test Ledger" }).returning();
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId: ledger.id, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: { mergeSimilarItems: false, autoRecognizeDate: true }
        };

        const context = {
            id: "task-error-2",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId: ledger.id,
            input,
        } as unknown as FlowContext;

        const error = new Error("Invalid JSON format: Unexpected token");

        await parseSourceDocumentHandler.onError!(error, input, context);

        const updatedDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });

        expect(updatedDoc?.status).toBe("anomaly");
        expect(updatedDoc?.anomalyCodes).toContain("parse_failed");
    });
});
