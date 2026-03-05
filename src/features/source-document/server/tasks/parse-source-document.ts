import { flowEngine, FlowTaskHandler, FlowContext } from '@/lib/flow';
import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { CategoryInfo, ParsedLedgerEntry } from "@/features/ai/server/types";
import { logger } from "@/lib/logger";
import { forLedger } from "@/lib/db/scoped-query";
import {
    handleParseResult,
    handleParseError,
    handleParseCancel,
} from "./parse-result-handler";

// Import multi-stage executors
import { executeStage0 } from "./stage0-vision";
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

        // ===== Stage 0: Vision Description =====
        let visionDescription: string | undefined;
        if (input.imageUrls?.length) {
            await setProgress('正在读取图片...');

            if (signal.aborted) {
                throw new Error('Task cancelled');
            }

            const stage0Result = await executeStage0({
                imageUrls: input.imageUrls,
                aiLanguage: input.aiLanguage,
            }, ai);
            if (stage0Result.description) {
                visionDescription = stage0Result.description;
                // Store in metadata for debugging/retry reuse
                await db.update(sourceDocuments)
                    .set({ metadata: { ...doc.metadata, visionDescription } })
                    .where(q.whereId(input.sourceDocumentId));
            }
        }

        // ===== Stage 1: Pre-Analysis =====
        await setProgress('正在分析单据信息...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const stage1Input: Stage1Input = {
            text: input.text,
            imageUrls: input.imageUrls,
            visionDescription,
            aiLanguage: input.aiLanguage,
            preferredCurrencies: input.preferredCurrencies,
            categories: input.categories.map(c => ({ name: c.name, description: c.description ?? null })),
            aiCustomPrompt: input.settings.aiCustomPrompt,
        };

        let stage1Result;
        try {
            stage1Result = await executeStage1(stage1Input, ai, signal);
        } catch (error) {
            if (error instanceof Error && error.message.includes('ARBITRATION_FAILED')) {
                logger.info({ docId: input.sourceDocumentId, error: error.message }, "Stage 1: Arbitration failed");
                return { ledgerEntries: [], anomalyReason: "预分析结果存在分歧", verificationStatus: 'anomaly' };
            }
            throw error;
        }

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

        logger.info({
            docId: input.sourceDocumentId,
            currencies: stage1Result.results.currency.currencies,
            categories: stage1Result.results.category.categories,
        }, "Stage 1: Pre-analysis completed");

        // ===== Stage 1.5: Validation =====
        await setProgress('正在核对分析结果...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        const validationResult = await executeStage1_5Validation({
            text: input.text,
            imageUrls: input.imageUrls,
            visionDescription,
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
        await setProgress('正在生成账单条目...');

        if (signal.aborted) {
            throw new Error('Task cancelled');
        }

        try {
            const stage2Result = await executeStage2({
                text: input.text,
                imageUrls: input.imageUrls,
                visionDescription,
                aiLanguage: input.aiLanguage,
                validationSummary: validationResult,
                originalCategories: input.categories.map(c => ({ name: c.name, description: c.description ?? null })),
            }, ai);

            // Convert Stage 2 entries to ParsedLedgerEntry format
            const ledgerEntriesResult: ParsedLedgerEntry[] = stage2Result.entries.map(entry => ({
                itemName: entry.item_name,
                amount: entry.amount,
                currency: entry.currency,
                categoryIndex: entry.category_index,
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

    async onComplete(output: ParseSourceDocumentOutput, input: ParseSourceDocumentInput, _context: FlowContext): Promise<void> {
        await handleParseResult({
            ledgerId: input.ledgerId,
            sourceDocumentId: input.sourceDocumentId,
            parsedEntries: output.ledgerEntries,
            title: output.title,
            anomalyReason: output.anomalyReason,
            verificationStatus: output.verificationStatus,
            categories: input.categories,
        });
    },

    async onError(error: Error, input: ParseSourceDocumentInput, _context: FlowContext): Promise<void> {
        logger.error({ error, sourceDocumentId: input.sourceDocumentId }, "Parse source document task failed");

        await handleParseError({
            ledgerId: input.ledgerId,
            sourceDocumentId: input.sourceDocumentId,
            error,
        });
    },

    async onCancel(input: ParseSourceDocumentInput, _context: FlowContext): Promise<void> {
        logger.info({ sourceDocumentId: input.sourceDocumentId }, "Parse source document task cancelled");

        await handleParseCancel({
            ledgerId: input.ledgerId,
            sourceDocumentId: input.sourceDocumentId,
        });
    }
};

// Register the task handler
flowEngine.register(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
