import { registerFlowTask, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
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
        aiCustomPrompt?: string;
    };
    preferredCurrencies?: string[];
}


export interface ParseSourceDocumentOutput {
    ledgerEntries: ParsedLedgerEntry[];
    title?: string;
    verificationStatus: 'passed' | 'first_batch_mismatch' | 'merge_mismatch' | 'unknown_currency' | 'invalid';
}

/**
 * Verify consistency between two sets of ledger entries
 */
function verifyAmounts(
    entries1: ParsedLedgerEntry[],
    entries2: ParsedLedgerEntry[]
): boolean {
    const groupTotals = (entries: ParsedLedgerEntry[]) => {
        const map = new Map<string, number>();
        for (const e of entries) {
            // Group by currency and date (if date missing, use 'null')
            const key = `${e.currency}|${e.entryDate || 'null'}`;
            // Use fixed precision to avoid floating point issues
            const current = map.get(key) || 0;
            map.set(key, Math.round((current + e.amount) * 100) / 100);
        }
        return map;
    };

    const totals1 = groupTotals(entries1);
    const totals2 = groupTotals(entries2);

    if (totals1.size !== totals2.size) return false;

    for (const [key, sum1] of totals1) {
        const sum2 = totals2.get(key);
        if (sum2 === undefined) return false;
        // Strict equality check (floating point handled by rounding above)
        if (Math.abs(sum1 - sum2) > 0.001) return false;
    }
    return true;
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
    },

    // 1. Main execution
    async execute(input: ParseSourceDocumentInput, context: FlowContext): Promise<ParseSourceDocumentOutput> {
        // Update status to processing
        await sourceDocumentRepo.setProcessing(input.sourceDocumentId, context.ledgerId);

        // Step 1: Dual GPT Processing
        await context.updateProgress({
            currentStep: "parse",
            completedSteps: [],
            totalSteps: input.settings.mergeSimilarItems ? 2 : 1,
        });

        const processor = getSourceDocumentProcessor();
        const processOptions = {
            categories: input.categories,
            mergeSimilarItems: false, // Handle merge manually
            language: input.language,
            preferredCurrencies: input.preferredCurrencies,
            aiCustomPrompt: input.settings.aiCustomPrompt
        };

        const processPayload = {
            text: input.text,
            images: input.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }))
        };

        // Parallel execution
        const [result1, result2] = await Promise.all([
            processor.process(processPayload, processOptions),
            processor.process(processPayload, processOptions)
        ]);

        // Helper to apply date override
        const applyDateOverride = (entries: ParsedLedgerEntry[]) => {
            if (input.settings.autoRecognizeDate) return entries;
            const today = new Date().toISOString().split("T")[0];
            return entries.map(entry => ({ ...entry, entryDate: today }));
        };

        const title = result1.title;
        const entries1 = applyDateOverride(result1.ledgerEntries);
        const entries2 = applyDateOverride(result2.ledgerEntries);

        // 1. Check validity
        if (result1.isValid === false) {
            return { ledgerEntries: [], title, verificationStatus: 'invalid' };
        }

        // 2. Check for unknown currency
        if (entries1.some(e => e.currency === "unknown")) {
            return { ledgerEntries: entries1, title, verificationStatus: 'unknown_currency' };
        }

        // 3. First Batch Verification
        if (!verifyAmounts(entries1, entries2)) {
            logger.warn({
                ledgerId: context.ledgerId,
                docId: input.sourceDocumentId,
                entries1,
                entries2
            }, "Dual GPT verification failed (first batch)");
            return { ledgerEntries: entries1, title, verificationStatus: 'first_batch_mismatch' };
        }

        // 4. Merge Similar Items (Optional)
        let finalEntries = entries1;
        if (input.settings.mergeSimilarItems && entries1.length > 1) {
            await context.updateProgress({
                currentStep: "merge",
                completedSteps: ["parse"],
                totalSteps: 2,
                data: { parseResult: finalEntries },
            });

            // Save pre-merge entries for verification
            const preMergeEntries = finalEntries;

            finalEntries = await summarizeLedgerEntries(finalEntries, input.language, input.text);

            // 5. Merge Verification
            // Note: Summarization might change structure but total amount per currency/date should match
            if (!verifyAmounts(preMergeEntries, finalEntries)) {
                logger.warn({
                    ledgerId: context.ledgerId,
                    docId: input.sourceDocumentId,
                    preMerge: preMergeEntries,
                    postMerge: finalEntries
                }, "Merge verification failed");
                return { ledgerEntries: finalEntries, title, verificationStatus: 'merge_mismatch' };
            }
        }

        // Passed all checks
        return {
            ledgerEntries: finalEntries,
            title,
            verificationStatus: 'passed'
        };
    },

    // 3. Final completion (IDEMPOTENT)
    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        const { ledgerEntries: parsedEntries, title, verificationStatus } = output;

        // 1. Check if entries already exist (Idempotency)
        const existingEntries = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId)
        });

        if (existingEntries) {
            logger.info({ sourceDocumentId: input.sourceDocumentId }, "Ledger entries already exist, skipping insert");
            return;
        }

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        // Determine final DB status and Anomaly Codes
        let status: "completed" | "anomaly" = "anomaly";
        let docAnomalyCodes: string[] = [];
        const globalEntryAnomalyCodes: string[] = [];

        switch (verificationStatus) {
            case 'passed':
                status = "completed";
                break;
            case 'first_batch_mismatch':
            case 'merge_mismatch':
                status = "anomaly";
                docAnomalyCodes.push("evidence_anomaly");
                globalEntryAnomalyCodes.push("evidence_anomaly"); // Mark all entries as anomalous so they are not "confirmed"
                break;
            case 'unknown_currency':
                status = "anomaly";
                docAnomalyCodes.push("unknown_currency"); // Good for filtering
                // We don't add global entry anomaly, we check per entry below
                break;
            case 'invalid':
                status = "anomaly";
                docAnomalyCodes.push("invalid_content");
                break;
        }

        // Handle invalid content (no entries to save)
        if (verificationStatus === 'invalid' || validEntries.length === 0) {
            // If no valid entries and passed, it's weird, but technically invalid content if empty
            if (status === 'completed' && validEntries.length === 0) {
                status = "anomaly";
                docAnomalyCodes = ["invalid_content"];
            }

            if (status === 'anomaly') {
                if (docAnomalyCodes.length === 0) docAnomalyCodes.push("invalid_content");
                await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, docAnomalyCodes, context.ledgerId);
            }

            if (title) {
                await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
            }
            return;
        }

        // Save entries
        const entriesToInsert = validEntries.map(entry => {
            const categoryId = entry.category
                ? input.categories.find((c) => c.name === entry.category)?.id ?? null
                : null;

            const entryAnomalies = [...globalEntryAnomalyCodes];
            if (entry.currency === "unknown") {
                entryAnomalies.push("unknown_currency");
            }

            return {
                ledgerId: context.ledgerId!,
                categoryId,
                sourceDocumentId: input.sourceDocumentId,
                amount: entry.amount.toString(),
                currency: entry.currency,
                itemName: entry.itemName || "未分类",
                description: entry.notes || null,
                entryDate: entry.entryDate ? new Date(entry.entryDate) : new Date(),
                anomalyCodes: entryAnomalies,
            };
        });

        if (entriesToInsert.length > 0) {
            await ledgerEntryRepo.batchCreate(entriesToInsert, context.ledgerId);
        }

        // Update document status
        if (status === 'anomaly') {
            await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, docAnomalyCodes, context.ledgerId);
        } else {
            await sourceDocumentRepo.batchComplete([input.sourceDocumentId], context.ledgerId!);
        }

        // Always update title if present
        if (title) {
            await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
        }
    },

    async onError(error: Error, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        logger.error({ error, sourceDocumentId: input.sourceDocumentId }, "Parse source document task failed");

        let anomalyCode = "internal_error";
        if (error.message.includes("schema validation failed") || error.message.includes("Invalid content")) {
            anomalyCode = "invalid_content";
        }

        // Update source document status to anomaly via Repo
        await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, [anomalyCode], context.ledgerId);
    },
};


// Register the task handler
registerFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
