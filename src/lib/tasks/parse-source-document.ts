// Parse Source Document Task
// Handles parsing source document images/text into ledger entries via AI

import { registerProcessingTask, ProcessingTaskHandler, ProcessingTask, ProcessingTaskExecutionContext } from "@/lib/processing";
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSourceDocumentProcessor } from "@/lib/message-processor/processor";
import { CategoryInfo, ParsedLedgerEntry } from "@/lib/message-processor/types";
import { summarizeLedgerEntries } from "@/lib/message-processor/utils";

// Task type constant
export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

export interface ParseSourceDocumentInput {
    sourceDocumentId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    language?: string;
    settings: {
        mergeSimilarItems: boolean;
        autoRecognizeDate: boolean;
        autoConfirm: boolean;
    };
}


interface ParseSourceDocumentOutput {
    ledgerEntries: ParsedLedgerEntry[];
    title?: string;
}

/**
 * Parse Source Document Task Handler
 */
export const parseSourceDocumentHandler: ProcessingTaskHandler<ParseSourceDocumentOutput> = {
    async execute(task: ProcessingTask, context: ProcessingTaskExecutionContext): Promise<ParseSourceDocumentOutput> {
        const input = task.input as ParseSourceDocumentInput;

        // Step 1: Parse with AI
        await context.updateProgress({
            currentStep: "parse",
            completedSteps: [],
            totalSteps: input.settings.mergeSimilarItems ? 2 : 1,
        });

        const processor = getSourceDocumentProcessor();
        const result = await processor.process(
            {
                text: input.text,
                images: input.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }))
            },
            {
                categories: input.categories,
                mergeSimilarItems: false, // Handle merge in step 2
                language: input.language
            }
        );

        // Apply date override if autoRecognizeDate is disabled
        let entries = result.ledgerEntries;
        if (!input.settings.autoRecognizeDate) {
            entries = entries.map(entry => ({
                ...entry,
                entryDate: new Date().toISOString().split("T")[0],
            }));
        }

        // Check if valid
        if (result.isValid === false) {
            return { ledgerEntries: [] };
        }

        // Step 2: Merge similar items (optional)
        if (input.settings.mergeSimilarItems && entries.length > 1) {
            await context.updateProgress({
                currentStep: "merge",
                completedSteps: ["parse"],
                totalSteps: 2,
                data: { parseResult: entries },
            });

            entries = await summarizeLedgerEntries(entries, input.language, input.text);
        }

        return {
            ledgerEntries: entries,
            title: result.title
        };
    },

    async onComplete(output: ParseSourceDocumentOutput, task: ProcessingTask): Promise<void> {
        const input = task.input as ParseSourceDocumentInput;
        const { ledgerEntries: parsedEntries, title } = output;
        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        if (validEntries.length > 0 && task.ledgerId) {
            const status = (input.settings.autoConfirm ? "confirmed" : "pending") as "confirmed" | "pending";
            const entriesToInsert = validEntries.map(entry => {
                const categoryId = entry.category
                    ? input.categories.find((c) => c.name === entry.category)?.id ?? null
                    : null;

                return {
                    ledgerId: task.ledgerId!,
                    categoryId,
                    sourceDocumentId: input.sourceDocumentId,
                    amount: entry.amount.toString(),
                    currency: entry.currency,
                    itemName: entry.itemName || "未分类",
                    description: entry.notes || null,
                    entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
                    status: status,
                };
            });

            await db.insert(ledgerEntries).values(entriesToInsert);

            // Mark source document as completed or to_confirm
            await db.update(sourceDocuments).set({
                status: input.settings.autoConfirm ? "completed" : "to_confirm",
                title: title || null,
            }).where(eq(sourceDocuments.id, input.sourceDocumentId));
        } else {
            // Mark source document as error if no valid entries (invalid content)
            await db.update(sourceDocuments).set({
                status: "error",
                errorCode: "invalid_content",
                title: title || null,
            }).where(eq(sourceDocuments.id, input.sourceDocumentId));
        }
    },

    async onError(error: Error, task: ProcessingTask): Promise<void> {
        const input = task.input as ParseSourceDocumentInput;

        // Determine error code
        let errorCode: "ai_service_error" | "parse_failed" | "unknown" = "unknown";
        if (error.message.includes("AI response") || error.message.includes("JSON") || error.message.includes("parse")) {
            errorCode = "parse_failed";
        } else if (error.message.includes("AI") || error.message.includes("OpenAI") || error.message.includes("service")) {
            errorCode = "ai_service_error";
        }

        // Update source document status to error
        await db.update(sourceDocuments).set({
            status: "error",
            errorCode: errorCode,
        }).where(eq(sourceDocuments.id, input.sourceDocumentId));
    },
};


// Register the task handler
registerProcessingTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
