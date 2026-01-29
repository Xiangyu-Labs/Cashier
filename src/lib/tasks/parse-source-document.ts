// Parse Source Document Task
// Handles parsing source document images/text into ledger entries via AI

import { registerFlowTask, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSourceDocumentProcessor } from "@/lib/message-processor/processor";
import { CategoryInfo, ParsedLedgerEntry } from "@/lib/message-processor/types";
import { summarizeLedgerEntries } from "@/lib/message-processor/utils";
import { logger } from "@/lib/logger";

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
        aiCustomPrompt?: string;
    };
    preferredCurrencies?: string[];
}


interface ParseSourceDocumentOutput {
    ledgerEntries: ParsedLedgerEntry[];
    title?: string;
}

/**
 * Parse Source Document Task Handler
 */
export const parseSourceDocumentHandler: FlowTaskHandler<ParseSourceDocumentInput, ParseSourceDocumentOutput> = {
    // 0. Pre-validations
    async validate(input: ParseSourceDocumentInput) {
        const doc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, input.sourceDocumentId),
        });
        if (!doc) {
            throw new Error(`Source document not found: ${input.sourceDocumentId}`);
        }
        // Optional: Check status?
    },

    // 1. Main execution
    async execute(input: ParseSourceDocumentInput, context: FlowContext): Promise<ParseSourceDocumentOutput> {
        // Update status to processing
        await db.update(sourceDocuments)
            .set({ status: 'processing' })
            .where(eq(sourceDocuments.id, input.sourceDocumentId));

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
                language: input.language,
                preferredCurrencies: input.preferredCurrencies,
                aiCustomPrompt: input.settings.aiCustomPrompt
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

    // 3. Final completion (IDEMPOTENT)
    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        const { ledgerEntries: parsedEntries, title } = output;

        // Idempotency check
        const existingEntries = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId)
        });

        if (existingEntries) {
            logger.info({ sourceDocumentId: input.sourceDocumentId }, "Ledger entries already exist, skipping write-back");
            return;
        }

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        if (validEntries.length > 0 && context.ledgerId) {
            const hasUnknownCurrency = validEntries.some(entry => entry.currency === "unknown");
            const status = (input.settings.autoConfirm && !hasUnknownCurrency ? "confirmed" : "pending") as "confirmed" | "pending";
            const entriesToInsert = validEntries.map(entry => {
                const categoryId = entry.category
                    ? input.categories.find((c) => c.name === entry.category)?.id ?? null
                    : null;

                return {
                    ledgerId: context.ledgerId!,
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
                status: (input.settings.autoConfirm && !hasUnknownCurrency) ? "completed" : "to_confirm",
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

    async onError(error: Error, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        // Determine error code
        let errorCode: "internal_error" | "parse_failed" | "invalid_content" = "internal_error";

        const message = error.message.toLowerCase();
        if (message.includes("schema validation") || message.includes("zod")) {
            errorCode = "invalid_content"; // Schema mismatch often means it's not a valid bill or has illegal fields
        } else if (message.includes("ai response") || message.includes("json") || message.includes("parse")) {
            errorCode = "parse_failed";
        }

        // Update source document status to error
        await db.update(sourceDocuments).set({
            status: "error",
            errorCode: errorCode,
        }).where(eq(sourceDocuments.id, input.sourceDocumentId));
    },
};


// Register the task handler
registerFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
