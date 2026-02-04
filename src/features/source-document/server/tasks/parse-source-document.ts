import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSourceDocumentProcessor } from "@/features/ai/server/services/processor";
import { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/server/types";
import { logger } from "@/lib/logger";
import { arbitrate } from "@/features/ai/server/services/arbitration";
import { forLedger } from "@/lib/db/scoped-query";

// Task type constant
export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

export interface ParseSourceDocumentInput {
    sourceDocumentId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    aiLanguage?: string;
    settings: {
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
            const key = `${e.currency}|${e.entryDate || 'null'}`;
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
        if (Math.abs(sum1 - sum2) > 0.001) return false;
    }
    return true;
}

/**
 * Parse Source Document Task Handler
 */
export const parseSourceDocumentHandler: FlowTaskHandler<ParseSourceDocumentInput, ParseSourceDocumentOutput> = {
    async execute(input: ParseSourceDocumentInput, context: FlowContext): Promise<ParseSourceDocumentOutput> {
        const { signal, updateProgress, ledgerId } = context;

        if (!ledgerId) throw new Error("Missing ledgerId in task context");

        // Validate document exists
        const doc = await db.query.sourceDocuments.findFirst({
            where: and(eq(sourceDocuments.id, input.sourceDocumentId), isNull(sourceDocuments.deletedAt)),
        });
        if (!doc) {
            throw new Error(`Source document not found: ${input.sourceDocumentId}`);
        }

        const q = forLedger(sourceDocuments, ledgerId);

        // Update status to processing
        await db.update(sourceDocuments)
            .set({ status: 'processing' })
            .where(q.whereId(input.sourceDocumentId));

        // ===== Stage 1: Dual GPT Processing (parallel) =====
        await updateProgress('正在识别图片...');

        // Check for cancellation before heavy operation
        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const processor = getSourceDocumentProcessor();
        const processOptions = {
            categories: input.categories,
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

        // TODO: Report token usage when processor supports it
        // context.reportTokens({ model: 'gpt-4o', input: result1.usage.input, output: result1.usage.output });

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

        // ===== Stage 2: Handle unknown currency =====
        if (entries1.some(e => e.currency === "unknown")) {
            await updateProgress('正在识别币种...');

            if (signal.aborted) {
                throw new Error('Task cancelled');
            }

            logger.info({ docId: input.sourceDocumentId }, "Unknown currency detected, invoking arbitration");

            const arbitrationResult = await arbitrate(
                "unknown_currency",
                entries1,
                entries2,
                input.text,
                input.aiLanguage,
                input.imageUrls,
                input.preferredCurrencies
            );

            if (arbitrationResult.choice === 0) {
                return {
                    ledgerEntries: [],
                    title,
                    anomalyReason: arbitrationResult.reason || "无法识别币种",
                    verificationStatus: 'anomaly'
                };
            }

            let chosenEntries = arbitrationResult.choice === 2 ? entries2 : entries1;

            if (arbitrationResult.currency) {
                logger.info({ currency: arbitrationResult.currency }, "Arbitration resolved unknown currency");
                const fixedCurrency = arbitrationResult.currency;
                entries1 = entries1.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
                entries2 = entries2.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
                chosenEntries = chosenEntries.map(e => e.currency === "unknown" ? { ...e, currency: fixedCurrency } : e);
            }

            entries1 = chosenEntries;
        }

        // ===== Stage 3: Verification / Arbitration =====
        if (!verifyAmounts(entries1, entries2)) {
            await updateProgress('正在校验结果...');

            if (signal.aborted) {
                throw new Error('Task cancelled');
            }

            logger.info({
                ledgerId,
                docId: input.sourceDocumentId,
            }, "Dual GPT verification failed, invoking arbitration");

            const arbitrationResult = await arbitrate(
                "total_mismatch",
                entries1,
                entries2,
                input.text,
                input.aiLanguage,
                input.imageUrls,
                input.preferredCurrencies
            );

            if (arbitrationResult.choice === 0) {
                return {
                    ledgerEntries: [],
                    title,
                    anomalyReason: arbitrationResult.reason || "账单金额存在歧义",
                    verificationStatus: 'anomaly'
                };
            }

            entries1 = arbitrationResult.choice === 1 ? entries1 : entries2;
            logger.info({ choice: arbitrationResult.choice }, "Arbitration resolved - using chosen result");
        }

        // Passed all checks
        return {
            ledgerEntries: entries1,
            title,
            verificationStatus: 'passed'
        };
    },

    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        const { ledgerId } = context;
        if (!ledgerId) throw new Error("Missing ledgerId in task context");

        const { ledgerEntries: parsedEntries, title, anomalyReason, verificationStatus } = output;

        const q = forLedger(sourceDocuments, ledgerId);
        const qEntries = forLedger(ledgerEntries, ledgerId);

        // Handle anomaly - do NOT save entries, just update document status
        if (verificationStatus === 'anomaly' || verificationStatus === 'invalid') {
            const anomalyCode = verificationStatus === 'invalid' ? 'invalid_content' : 'evidence_anomaly';

            await db.update(sourceDocuments)
                .set({
                    status: 'anomaly',
                    anomalyCodes: [anomalyCode]
                })
                .where(q.whereId(input.sourceDocumentId));

            const displayTitle = anomalyReason || title;
            if (displayTitle) {
                await db.update(sourceDocuments)
                    .set({ title: displayTitle })
                    .where(q.whereId(input.sourceDocumentId));
            }
            return;
        }

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        // Handle empty valid entries
        if (validEntries.length === 0) {
            await db.update(sourceDocuments)
                .set({
                    status: 'anomaly',
                    anomalyCodes: ['invalid_content']
                })
                .where(q.whereId(input.sourceDocumentId));

            if (title) {
                await db.update(sourceDocuments)
                    .set({ title })
                    .where(q.whereId(input.sourceDocumentId));
            }
            return;
        }

        // Save entries
        const entriesToInsert = validEntries.map(entry => {
            const categoryId = entry.category
                ? input.categories.find((c) => c.name === entry.category)?.id ?? null
                : null;

            return {
                ledgerId: ledgerId!,
                categoryId,
                sourceDocumentId: input.sourceDocumentId,
                amount: entry.amount.toFixed(2),
                currency: entry.currency,
                itemName: entry.itemName || "未分类",
                description: entry.notes || null,
                entryDate: entry.entryDate || new Date().toISOString().split('T')[0],
            };
        });

        // Delete existing entries for this source document (enables retry)
        await db.update(ledgerEntries)
            .set({ deletedAt: new Date() })
            .where(and(
                eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
                qEntries.whereActive
            ));

        if (entriesToInsert.length > 0) {
            await db.insert(ledgerEntries).values(entriesToInsert);
        }

        // Update document status to completed
        await db.update(sourceDocuments)
            .set({ status: 'completed' })
            .where(q.whereId(input.sourceDocumentId));

        // Update title if present
        if (title) {
            await db.update(sourceDocuments)
                .set({ title })
                .where(q.whereId(input.sourceDocumentId));
        }
    },

    async onError(error: Error, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        logger.error({ error, sourceDocumentId: input.sourceDocumentId }, "Parse source document task failed");

        let anomalyCode = "internal_error";
        if (error.message.includes("schema validation failed") || error.message.includes("Invalid content")) {
            anomalyCode = "invalid_content";
        }

        if (!context.ledgerId) {
            logger.warn({ sourceDocumentId: input.sourceDocumentId }, "Missing ledgerId in onError, cannot update status");
            return;
        }

        const q = forLedger(sourceDocuments, context.ledgerId);

        await db.update(sourceDocuments)
            .set({
                status: 'anomaly',
                anomalyCodes: [anomalyCode]
            })
            .where(q.whereId(input.sourceDocumentId));
    },

    async onCancel(input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        logger.info({ sourceDocumentId: input.sourceDocumentId }, "Parse source document task cancelled");

        if (!context.ledgerId) {
            return;
        }

        const q = forLedger(sourceDocuments, context.ledgerId);

        // Reset document status back to pending on cancellation
        await db.update(sourceDocuments)
            .set({ status: 'pending' })
            .where(q.whereId(input.sourceDocumentId));
    }
};

// Register the task handler
flowEngine.register(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
