import { describe, it, expect } from "vitest";
import { parseSourceDocumentHandler, ParseSourceDocumentInput, TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/features/source-document/server/tasks/parse-source-document";
import { getTestDb } from "../../../setup";
import { sourceDocuments } from "@/lib/db/schema";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";
import { eq } from "drizzle-orm";
import { FlowContext } from "@/lib/flow";

describe("parseSourceDocumentHandler.onError", () => {
    it("should map schema validation errors (zod) to 'invalid_content'", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "err1@example.com");
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: { autoRecognizeDate: true }
        };

        const context = {
            id: "task-error-1",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId,
            input,
        } as unknown as FlowContext;

        const error = new Error("AI response schema validation failed: ledger_entries: Required");

        await parseSourceDocumentHandler.onError!(error, input, context);

        const updatedDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });

        expect(updatedDoc?.status).toBe("anomaly");
        expect(updatedDoc?.anomalyCodes).toContain("invalid_content");
    });

    it("should map JSON parsing errors to 'internal_error'", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "err2@example.com");
        const [sourceDoc] = await db.insert(sourceDocuments).values({ ledgerId, status: "processing" }).returning();

        const input: ParseSourceDocumentInput = {
            sourceDocumentId: sourceDoc.id,
            categories: [],
            settings: { autoRecognizeDate: true }
        };

        const context = {
            id: "task-error-2",
            type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
            ledgerId,
            input,
        } as unknown as FlowContext;

        const error = new Error("Invalid JSON format: Unexpected token");

        await parseSourceDocumentHandler.onError!(error, input, context);

        const updatedDoc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, sourceDoc.id)
        });

        expect(updatedDoc?.status).toBe("anomaly");
        expect(updatedDoc?.anomalyCodes).toContain("internal_error");
    });
});
