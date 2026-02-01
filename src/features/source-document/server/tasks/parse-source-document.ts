import { registerFlowTask, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, ledgers } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSourceDocumentProcessor } from "@/features/ai/server/services/processor";
import { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/server/types";
import { summarizeLedgerEntries } from "@/features/ai/server/utils/utils";
import { logger } from "@/lib/logger";
import { sourceDocumentRepo } from "../repository";
import { ledgerEntryRepo } from "@/features/ledger/server/repository";
import { arbitrate } from "@/features/ai/server/services/arbitration";
import { sendNotificationToUser } from "@/features/notifications/server/services/push-service";

// Task type constant
export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

export interface ParseSourceDocumentInput {
    sourceDocumentId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    aiLanguage?: string;
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
    anomalyReason?: string;
    verificationStatus: 'passed' | 'anomaly' | 'invalid';
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
            where: and(eq(sourceDocuments.id, input.sourceDocumentId), isNull(sourceDocuments.deletedAt)),
        });
        if (!doc) {
            throw new Error(`Source document not found: ${input.sourceDocumentId}`);
        }
    },

    // 1. Main execution
    async execute(input: ParseSourceDocumentInput, context: FlowContext): Promise<ParseSourceDocumentOutput> {
        if (!context.ledgerId) throw new Error("Missing ledgerId in task context");
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
            aiLanguage: input.aiLanguage,
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
        let entries1 = applyDateOverride(result1.ledgerEntries);
        let entries2 = applyDateOverride(result2.ledgerEntries);

        // 1. Check validity
        if (result1.isValid === false) {
            return { ledgerEntries: [], title, verificationStatus: 'invalid' };
        }

        // 2. Check for unknown currency - use arbitration
        if (entries1.some(e => e.currency === "unknown")) {
            logger.info({ docId: input.sourceDocumentId }, "Unknown currency detected, invoking arbitration");

            const arbitrationResult = await arbitrate(
                "unknown_currency",
                entries1,
                entries2,
                input.text,
                input.aiLanguage
            );

            if (arbitrationResult.choice === 0) {
                // Genuinely unidentifiable
                return {
                    ledgerEntries: [],
                    title,
                    anomalyReason: arbitrationResult.reason || "无法识别币种",
                    verificationStatus: 'anomaly'
                };
            }

            // Pick the better result and apply the arbitrated currency
            let chosenEntries = arbitrationResult.choice === 2 ? entries2 : entries1;

            if (arbitrationResult.currency) {
                logger.info({ currency: arbitrationResult.currency }, "Arbitration resolved unknown currency");
                const fixedCurrency = arbitrationResult.currency;
                entries1 = entries1.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
                entries2 = entries2.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
                // Also update the chosen entries to make sure we don't return 'unknown'
                chosenEntries = chosenEntries.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
            }

            // Re-assign to entries1 so following checks (e.g. verifyAmounts) use the fixed version
            entries1 = chosenEntries;
            // Also need to ensure entries2 is somewhat sane for verifyAmounts if arbitration worked
            // but we'll let verifyAmounts handle potential mismatches next.
        }

        // 3. First Batch Verification - use arbitration if mismatch
        if (!verifyAmounts(entries1, entries2)) {
            logger.info({
                ledgerId: context.ledgerId,
                docId: input.sourceDocumentId,
            }, "Dual GPT verification failed, invoking arbitration");

            const arbitrationResult = await arbitrate(
                "total_mismatch",
                entries1,
                entries2,
                input.text,
                input.aiLanguage
            );

            if (arbitrationResult.choice === 0) {
                // Genuinely ambiguous document
                return {
                    ledgerEntries: [],
                    title,
                    anomalyReason: arbitrationResult.reason || "账单金额存在歧义",
                    verificationStatus: 'anomaly'
                };
            }

            // Use the chosen result
            entries1 = arbitrationResult.choice === 1 ? entries1 : entries2;
            logger.info({ choice: arbitrationResult.choice }, "Arbitration resolved - using chosen result");
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

            finalEntries = await summarizeLedgerEntries(finalEntries, input.aiLanguage, input.text);

            // 5. Merge Verification - also use arbitration
            if (!verifyAmounts(preMergeEntries, finalEntries)) {
                logger.info({
                    ledgerId: context.ledgerId,
                    docId: input.sourceDocumentId,
                }, "Merge verification failed, invoking arbitration");

                const arbitrationResult = await arbitrate(
                    "total_mismatch",
                    preMergeEntries,
                    finalEntries,
                    input.text,
                    input.aiLanguage
                );

                if (arbitrationResult.choice === 0) {
                    return {
                        ledgerEntries: [],
                        title,
                        anomalyReason: arbitrationResult.reason || "合并后金额不一致",
                        verificationStatus: 'anomaly'
                    };
                }

                // Use pre-merge or post-merge based on choice
                finalEntries = arbitrationResult.choice === 1 ? preMergeEntries : finalEntries;
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
        if (!context.ledgerId) throw new Error("Missing ledgerId in task context");
        const { ledgerEntries: parsedEntries, title, anomalyReason, verificationStatus } = output;

        // 1. Check if entries already exist (Idempotency)
        const [existingEntries] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId)).limit(1);

        if (existingEntries) {
            logger.info({ sourceDocumentId: input.sourceDocumentId }, "Ledger entries already exist, ensuring status is completed");
            // Still need to mark as completed and update title even if entries exist (idempotency)
            await sourceDocumentRepo.batchComplete([input.sourceDocumentId], context.ledgerId!);
            if (title) {
                await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
            }
            return;
        }

        // Handle anomaly - do NOT save entries, just update document status
        if (verificationStatus === 'anomaly' || verificationStatus === 'invalid') {
            const anomalyCode = verificationStatus === 'invalid' ? 'invalid_content' : 'evidence_anomaly';
            await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, [anomalyCode], context.ledgerId);

            // Save anomaly reason as title for user visibility
            const displayTitle = anomalyReason || title;
            if (displayTitle) {
                await sourceDocumentRepo.update(input.sourceDocumentId, { title: displayTitle }, context.ledgerId);
            }
            return;
        }

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        // Handle empty valid entries
        if (validEntries.length === 0) {
            await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, ["invalid_content"], context.ledgerId);
            if (title) {
                await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
            }
            return;
        }

        // Save entries (no anomalyCodes field anymore)
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
            };
        });

        if (entriesToInsert.length > 0) {
            await ledgerEntryRepo.batchCreate(entriesToInsert, context.ledgerId);
        }

        // Update document status to completed
        await sourceDocumentRepo.batchComplete([input.sourceDocumentId], context.ledgerId!);

        // Update title if present
        if (title) {
            await sourceDocumentRepo.update(input.sourceDocumentId, { title }, context.ledgerId);
        }

        // Send Push Notification
        if (context.ledgerId) {
            // Fetch ledger owner
            const ledger = await db.query.ledgers.findFirst({
                where: eq(ledgers.id, context.ledgerId),
                columns: { userId: true }
            });

            if (ledger?.userId) {
                await sendNotificationToUser(ledger.userId, {
                    title: "Document Processed",
                    body: `Your document "${title || "untitled"}" has been successfully processed.`,
                    url: `/ledger/${context.ledgerId}`,
                    data: { ledgerId: context.ledgerId, sourceDocumentId: input.sourceDocumentId }
                });
            }
        }
    },

    async onError(error: Error, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        console.error("DEBUG WORKER ERROR:", error);
        logger.error({ error, sourceDocumentId: input.sourceDocumentId }, "Parse source document task failed");

        let anomalyCode = "internal_error";
        if (error.message.includes("schema validation failed") || error.message.includes("Invalid content")) {
            anomalyCode = "invalid_content";
        }

        if (!context.ledgerId) {
            logger.warn({ sourceDocumentId: input.sourceDocumentId }, "Missing ledgerId in onError, cannot update status");
            return;
        }

        // Update source document status to anomaly via Repo
        await sourceDocumentRepo.setAnomaly(input.sourceDocumentId, [anomalyCode], context.ledgerId);
    },
};


// Register the task handler
registerFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
