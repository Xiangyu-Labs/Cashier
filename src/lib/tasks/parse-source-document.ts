import { registerFlowTask, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db"; // Still needed for query checking? Or use repo find? 
// Actually repo doesn't have find yet. We can keep db.query for reads.
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSourceDocumentProcessor } from "@/lib/message-processor/processor";
import { CategoryInfo, ParsedLedgerEntry } from "@/lib/message-processor/types";
import { summarizeLedgerEntries } from "@/lib/message-processor/utils";
import { logger } from "@/lib/logger";
import { sourceDocumentRepo, ledgerEntryRepo } from "@/lib/repositories";

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


export interface ParseSourceDocumentOutput {
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
        await sourceDocumentRepo.setProcessing(input.sourceDocumentId, context.ledgerId);

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
            title: result.title,
        };
    },

    // 3. Final completion (IDEMPOTENT)
    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        const { ledgerEntries: parsedEntries, title } = output;

        // Removed transaction transaction to ensure events are published correctly.
        // We rely on sequential idempotent checks.

        // 1. Check if entries already exist (Idempotency)
        const existingEntries = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId)
        });

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);
        const hasUnknownCurrency = validEntries.some(entry => entry.currency === "unknown");

        // Determine final status
        let targetStatus: "completed" | "to_confirm" | "error" = "to_confirm";
        if (validEntries.length === 0) {
            targetStatus = "error";
        } else if (input.settings.autoConfirm && !hasUnknownCurrency) {
            targetStatus = "completed";
        }

        if (!existingEntries) {
            if (targetStatus === "error") {
                await sourceDocumentRepo.setError(input.sourceDocumentId, "invalid_content", context.ledgerId);
                // Also update title if needed, but Repo setError only takes error code. 
                // We should probably allow general update in repo or add setTitle.
                // For now, let's assume error doesn't need title update or we do a separate update if crucial.
                // Wait, original code updated title on error.
                if (title) {
                    await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
                }
            } else {
                const status = (targetStatus === "completed") ? "confirmed" : "pending";
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
                        status: status as "confirmed" | "pending",
                    };
                });

                if (entriesToInsert.length > 0) {
                    await ledgerEntryRepo.batchCreate(entriesToInsert, context.ledgerId);
                }

                await sourceDocumentRepo.update(input.sourceDocumentId, {
                    status: targetStatus,
                    title: title || null
                }, context.ledgerId);
            }
        } else {
            logger.info({ sourceDocumentId: input.sourceDocumentId }, "Ledger entries already exist, skipping insert but ensuring status update");

            if (targetStatus !== "error") {
                await sourceDocumentRepo.update(input.sourceDocumentId, {
                    status: targetStatus,
                    title: title || null
                }, context.ledgerId);
            }
        }
    },

    async onError(error: Error, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        // Determine error code
        let errorCode: "internal_error" | "parse_failed" | "invalid_content" = "internal_error";
        let isUnrecoverable = false;

        const message = error.message.toLowerCase();
        if (message.includes("schema validation") || message.includes("zod")) {
            errorCode = "invalid_content";
            isUnrecoverable = true;
        } else if (message.includes("ai response") || message.includes("json") || message.includes("parse")) {
            errorCode = "parse_failed";
        }

        // Update source document status to error via Repo
        await sourceDocumentRepo.setError(input.sourceDocumentId, errorCode, context.ledgerId);

        if (isUnrecoverable) {
            const { UnrecoverableError } = await import('bullmq');
            throw new UnrecoverableError(error.message);
        }
    },
};


// Register the task handler
registerFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
