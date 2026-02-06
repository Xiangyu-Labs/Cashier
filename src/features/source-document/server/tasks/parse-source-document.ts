import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/server/types";
import { logger } from "@/lib/logger";
import { forLedger } from "@/lib/db/scoped-query";

// Import multi-stage executors
import { executeStage1, type Stage1Input } from "./stage1-executor";
import { executeStage1_5Validation } from "./stage1-5-validator";
import { executeStage2 } from "./stage2-executor";

// Task type constant
export const TASK_TYPE_PARSE_SOURCE_DOCUMENT = "parse_source_document";

export interface ParseSourceDocumentInput {
    ledgerId: string;
    sourceDocumentId: string;
    text?: string;
    imageUrls?: string[];
    categories: CategoryInfo[];
    aiLanguage?: string;
    settings: {
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
 * Parse Source Document Task Handler
 * 
 * Multi-stage architecture:
 * - Stage 1: Pre-analysis (validity, currency, category, title, user rules)
 * - Stage 1.5: Validation (veto power + consolidation)
 * - Stage 2: Detailed parsing (extract ledger entries)
 */
export const parseSourceDocumentHandler: FlowTaskHandler<ParseSourceDocumentInput, ParseSourceDocumentOutput> = {
    async execute(input: ParseSourceDocumentInput, context: FlowContext): Promise<ParseSourceDocumentOutput> {
        const { signal, updateProgress, ai } = context;
        const { ledgerId } = input;

        if (!ledgerId) throw new Error("Missing ledgerId in task input");

        // Validate document exists
        const doc = await db.query.sourceDocuments.findFirst({
            where: and(eq(sourceDocuments.id, input.sourceDocumentId), isNull(sourceDocuments.deletedAt)),
        });
        if (!doc) {
            throw new Error(`Source document not found: ${input.sourceDocumentId}`);
        }

        const q = forLedger(sourceDocuments, ledgerId);

        // Helper: Update progress in task_runs only
        const setProgress = async (message: string) => {
            await updateProgress(message);  // Flow Engine: task_runs.progress
        };

        // Update status to processing
        await db.update(sourceDocuments)
            .set({ status: 'processing' })
            .where(q.whereId(input.sourceDocumentId));

        // ===== Stage 1: Pre-Analysis =====
        await setProgress('正在预分析...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const stage1Input: Stage1Input = {
            text: input.text,
            imageUrls: input.imageUrls,
            aiLanguage: input.aiLanguage,
            preferredCurrencies: input.preferredCurrencies,
            categories: input.categories.map(c => ({ name: c.name, description: null })),
            aiCustomPrompt: input.settings.aiCustomPrompt,
        };

        const stage1Result = await executeStage1(stage1Input, ai, signal);

        // Check validity from Stage 1
        if (!stage1Result.isValid) {
            logger.info({ docId: input.sourceDocumentId }, "Stage 1: Document invalid");
            return { ledgerEntries: [], verificationStatus: 'invalid' };
        }

        // Check completeness from Stage 1 - detect obvious missing content
        if (stage1Result.isIncomplete) {
            logger.info({
                docId: input.sourceDocumentId,
                reason: stage1Result.incompleteReason,
            }, "Stage 1: Document incomplete");
            return {
                ledgerEntries: [],
                anomalyReason: stage1Result.incompleteReason || "内容不完整",
                verificationStatus: 'anomaly'
            };
        }

        // Check for unknown currency from Stage 1 - intercept early
        const currencies = stage1Result.results.currency.currencies;
        const hasUnknownCurrency = currencies.some(c =>
            !c || c.toLowerCase() === 'unknown' || c.toLowerCase() === 'undefined'
        );
        if (hasUnknownCurrency) {
            logger.info({
                docId: input.sourceDocumentId,
                currencies,
            }, "Stage 1: Unknown currency detected");
            return {
                ledgerEntries: [],
                anomalyReason: "无法识别货币类型",
                verificationStatus: 'anomaly'
            };
        }

        // ===== Stage 1.5: Validation =====
        await setProgress('正在校验货币与类别...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const validationResult = await executeStage1_5Validation({
            text: input.text,
            imageUrls: input.imageUrls,
            aiLanguage: input.aiLanguage,
            stage1Results: stage1Result.results,
        }, ai);

        // Check if validation passed
        if (!validationResult.is_reasonable) {
            logger.info({
                docId: input.sourceDocumentId,
                reason: validationResult.rejection_reason
            }, "Stage 1.5: Validation rejected");
            return {
                ledgerEntries: [],
                anomalyReason: validationResult.rejection_reason || "预分析结果不合理",
                verificationStatus: 'anomaly'
            };
        }

        // ===== Stage 2: Detailed Parsing =====
        await setProgress('正在解析账单条目...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        try {
            const stage2Result = await executeStage2({
                text: input.text,
                imageUrls: input.imageUrls,
                aiLanguage: input.aiLanguage,
                validationSummary: validationResult,
            }, ai);

            // Convert Stage 2 entries to ParsedLedgerEntry format
            const ledgerEntriesResult: ParsedLedgerEntry[] = stage2Result.entries.map(entry => ({
                itemName: entry.item_name,
                amount: entry.amount,
                currency: entry.currency,
                category: entry.category,
                entryDate: null,  // Will be set from source document in onComplete
                notes: entry.notes,
            }));

            logger.info({
                docId: input.sourceDocumentId,
                entryCount: ledgerEntriesResult.length,
                wasArbitrated: stage2Result.wasArbitrated,
            }, "Stage 2: Parsing completed");

            return {
                ledgerEntries: ledgerEntriesResult,
                title: stage2Result.title,
                verificationStatus: 'passed'
            };
        } catch (error) {
            // Handle Stage 2 arbitration failure
            if (error instanceof Error && error.message.includes('STAGE2_ARBITRATION_FAILED')) {
                logger.info({ docId: input.sourceDocumentId }, "Stage 2: Arbitration failed");
                return {
                    ledgerEntries: [],
                    anomalyReason: "解析结果存在分歧",
                    verificationStatus: 'anomaly'
                };
            }
            throw error;
        }
    },

    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        const { ledgerId } = input;
        if (!ledgerId) throw new Error("Missing ledgerId in task input");

        const { ledgerEntries: parsedEntries, title, anomalyReason, verificationStatus } = output;

        const q = forLedger(sourceDocuments, ledgerId);
        const qEntries = forLedger(ledgerEntries, ledgerId);

        // Query source document to get its entryDate for fallback
        const doc = await db.query.sourceDocuments.findFirst({
            where: and(eq(sourceDocuments.id, input.sourceDocumentId), isNull(sourceDocuments.deletedAt)),
        });

        // Handle anomaly - do NOT save entries, just update document status
        if (verificationStatus === 'anomaly' || verificationStatus === 'invalid') {
            const reason = anomalyReason || (verificationStatus === 'invalid' ? '无效内容' : '解析结果存在分歧');

            await db.update(sourceDocuments)
                .set({
                    status: 'anomaly',
                    anomalyReason: reason,
                    title: title || undefined
                })
                .where(q.whereId(input.sourceDocumentId));
            return;
        }

        const validEntries = parsedEntries.filter(entry => entry.amount > 0);

        // Handle empty valid entries
        if (validEntries.length === 0) {
            await db.update(sourceDocuments)
                .set({
                    status: 'anomaly',
                    anomalyReason: '无有效金额的条目',
                    title: title || undefined
                })
                .where(q.whereId(input.sourceDocumentId));

            if (title) {
                await db.update(sourceDocuments)
                    .set({ title })
                    .where(q.whereId(input.sourceDocumentId));
            }
            return;
        }

        // Check for unknown currency - should trigger anomaly
        const unknownCurrencyEntries = validEntries.filter(
            entry => !entry.currency || entry.currency.toLowerCase() === 'unknown'
        );
        if (unknownCurrencyEntries.length > 0) {
            await db.update(sourceDocuments)
                .set({
                    status: 'anomaly',
                    anomalyReason: '无法识别货币类型',
                    title: title || undefined
                })
                .where(q.whereId(input.sourceDocumentId));
            return;
        }
        // Save entries
        const entriesToInsert = validEntries.map(entry => {
            const categoryId = entry.category
                ? input.categories.find((c) => c.name === entry.category)?.id ?? null
                : null;

            // Use source document's entryDate as primary fallback, then today's date
            const now = new Date();
            const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const fallbackDate = doc?.entryDate || todayDate;

            return {
                ledgerId: ledgerId!,
                categoryId,
                sourceDocumentId: input.sourceDocumentId,
                amount: entry.amount.toFixed(2),
                currency: entry.currency,
                itemName: entry.itemName || "未分类",
                description: entry.notes || null,
                entryDate: fallbackDate,
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

        if (!input.ledgerId) {
            logger.warn({ sourceDocumentId: input.sourceDocumentId }, "Missing ledgerId in input, cannot update status");
            return;
        }

        const q = forLedger(sourceDocuments, input.ledgerId);

        await db.update(sourceDocuments)
            .set({
                status: 'anomaly',
                anomalyReason: error instanceof Error ? error.message : '内部错误'
            })
            .where(q.whereId(input.sourceDocumentId));
    },

    async onCancel(input: ParseSourceDocumentInput, context: FlowContext): Promise<void> {
        logger.info({ sourceDocumentId: input.sourceDocumentId }, "Parse source document task cancelled");

        if (!input.ledgerId) {
            return;
        }

        const q = forLedger(sourceDocuments, input.ledgerId);

        // Reset document status back to pending on cancellation
        await db.update(sourceDocuments)
            .set({ status: 'pending' })
            .where(q.whereId(input.sourceDocumentId));
    }
};

// Register the task handler
flowEngine.register(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
