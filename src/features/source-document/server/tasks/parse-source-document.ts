import { flowEngine, type FlowTaskHandler, type FlowContext } from "@/lib/flow";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { type CategoryInfo, type ParsedLedgerEntry } from "@/features/ai/types";
import type { AIContext } from "@/lib/flow/types";
import { logger } from "@/lib/logger";
import { forLedger } from "@/lib/db/scoped-query";
import { handleParseResult, handleParseError, handleParseCancel } from "./parse-result-handler";

// Import multi-stage executors
import { executeStage0 } from "./stage0-vision";
import { executeStage1, type Stage1Input } from "./stage1-executor";
import type { Stage1Results } from "./types";
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
  verificationStatus: "passed" | "anomaly" | "invalid";
}

/**
 * Parse Source Document Task Handler
 *
 * Multi-stage architecture:
 * - Stage 1: Pre-analysis (validity, currency, category, title, user rules)
 * - Stage 1.5: Validation (veto power + consolidation)
 * - Stage 2: Detailed parsing (extract ledger entries)
 */
// ============ Stage Handlers ============

interface StageContext {
  signal: AbortSignal;
  ai: AIContext;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
  q: ReturnType<typeof forLedger>;
}

/**
 * Run Stage 0: Vision Description
 * Extracts text description from images if available
 */
async function runStage0(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<string | undefined> {
  if (input.imageUrls == null || input.imageUrls.length === 0) return undefined;

  await ctx.setProgress("正在读取图片...");

  if (ctx.signal.aborted) {
    throw new Error("Task cancelled");
  }

  const stage0Result = await executeStage0(
    {
      imageUrls: input.imageUrls,
      aiLanguage: input.aiLanguage,
    },
    ctx.ai
  );

  if (stage0Result.description != null && stage0Result.description !== "") {
    // Store in metadata for debugging/retry reuse
    const doc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.id, ctx.docId), isNull(sourceDocuments.deletedAt)),
    });
    if (doc != null) {
      await db
        .update(sourceDocuments)
        .set({ metadata: { ...doc.metadata, visionDescription: stage0Result.description } })
        .where(ctx.q.whereId(ctx.docId));
    }
    return stage0Result.description;
  }

  return undefined;
}

/**
 * Build Stage 1 input from parse input
 */
function buildStage1Input(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined
): Stage1Input {
  return {
    text: input.text,
    imageUrls: input.imageUrls,
    visionDescription,
    aiLanguage: input.aiLanguage,
    preferredCurrencies: input.preferredCurrencies,
    categories: input.categories.map((c) => ({ name: c.name, description: c.description ?? null })),
    aiCustomPrompt: input.settings.aiCustomPrompt,
  };
}

/**
 * Check Stage 1 results for various failure conditions
 */
function checkStage1Results(
  stage1Result: Awaited<ReturnType<typeof executeStage1>>,
  docId: string
): ParseSourceDocumentOutput | null {
  // Check validity from Stage 1
  if (!stage1Result.isValid) {
    logger.info({ docId }, "Stage 1: Document invalid");
    return { ledgerEntries: [], verificationStatus: "invalid", title: stage1Result.title };
  }

  // Check completeness from Stage 1 - detect obvious missing content
  if (stage1Result.isIncomplete) {
    logger.info(
      {
        docId,
        reason: stage1Result.incompleteReason,
      },
      "Stage 1: Document incomplete"
    );
    return {
      ledgerEntries: [],
      anomalyReason: stage1Result.incompleteReason ?? "Content incomplete",
      verificationStatus: "anomaly",
      title: stage1Result.title,
    };
  }

  // Check for unknown currency from Stage 1 - intercept early
  const currencies = stage1Result.results.currency.currencies;
  const hasUnknownCurrency = currencies.some(
    (c) => c === "" || c.toLowerCase() === "unknown" || c.toLowerCase() === "undefined"
  );
  if (hasUnknownCurrency) {
    logger.info({ docId, currencies }, "Stage 1: Unknown currency detected");
    return {
      ledgerEntries: [],
      anomalyReason: "Unable to recognize currency type",
      verificationStatus: "anomaly",
    };
  }

  return null;
}

/**
 * Run Stage 1: Pre-Analysis
 */
async function runStage1(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  ctx: StageContext
): Promise<Stage1Results> {
  await ctx.setProgress("正在分析单据信息...");

  if (ctx.signal.aborted) {
    throw new Error("Task cancelled");
  }

  const stage1Input = buildStage1Input(input, visionDescription);

  let stage1Result;
  try {
    stage1Result = await executeStage1(stage1Input, ctx.ai, ctx.signal);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ARBITRATION_FAILED")) {
      logger.info({ docId: ctx.docId, error: error.message }, "Stage 1: Arbitration failed");
      throw new Error("STAGE1_ANOMALY:Pre-analysis results diverged");
    }
    throw error;
  }

  const failureResult = checkStage1Results(stage1Result, ctx.docId);
  if (failureResult) {
    // Use error to short-circuit execution
    throw new Error(`STAGE1_RESULT:${JSON.stringify(failureResult)}`);
  }

  // At this point, stage1Result must have results (TypeScript doesn't know this)
  const resultWithData = stage1Result as {
    isValid: true;
    isIncomplete: false;
    results: Stage1Results;
  };

  logger.info(
    {
      docId: ctx.docId,
      currencies: resultWithData.results.currency.currencies,
      categories: resultWithData.results.category.categories,
    },
    "Stage 1: Pre-analysis completed"
  );

  return resultWithData.results;
}

/**
 * Run Stage 1.5: Validation
 */
async function runStage1_5(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  stage1Results: Stage1Results,
  ctx: StageContext
): Promise<Awaited<ReturnType<typeof executeStage1_5Validation>>> {
  await ctx.setProgress("正在核对分析结果...");

  if (ctx.signal.aborted) {
    throw new Error("Task cancelled");
  }

  const validationResult = await executeStage1_5Validation(
    {
      text: input.text,
      imageUrls: input.imageUrls,
      visionDescription,
      aiLanguage: input.aiLanguage,
      stage1Results,
    },
    ctx.ai
  );

  // Check if validation passed
  if (!validationResult.is_reasonable) {
    logger.info(
      {
        docId: ctx.docId,
        reason: validationResult.rejection_reason,
      },
      "Stage 1.5: Validation rejected"
    );
    throw new Error(
      `STAGE1_5_ANOMALY:${validationResult.rejection_reason ?? "Pre-analysis results invalid"}`
    );
  }

  return validationResult;
}

/**
 * Convert Stage 2 entries to ParsedLedgerEntry format
 */
function convertToParsedEntries(
  entries: Array<{
    item_name: string;
    amount: number;
    currency: string;
    category_index: number;
    notes: string | null;
  }>
): ParsedLedgerEntry[] {
  return entries.map((entry) => ({
    itemName: entry.item_name,
    amount: entry.amount,
    currency: entry.currency,
    categoryIndex: entry.category_index,
    entryDate: null, // Will be set from source document in onComplete
    notes: entry.notes,
  }));
}

/**
 * Run Stage 2: Detailed Parsing
 */
async function runStage2(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  validationResult: Awaited<ReturnType<typeof executeStage1_5Validation>>,
  ctx: StageContext
): Promise<ParseSourceDocumentOutput> {
  await ctx.setProgress("正在生成账单条目...");

  if (ctx.signal.aborted) {
    throw new Error("Task cancelled");
  }

  try {
    const stage2Result = await executeStage2(
      {
        text: input.text,
        imageUrls: input.imageUrls,
        visionDescription,
        aiLanguage: input.aiLanguage,
        validationSummary: validationResult,
        originalCategories: input.categories.map((c) => ({
          name: c.name,
          description: c.description ?? null,
        })),
      },
      ctx.ai
    );

    const ledgerEntriesResult = convertToParsedEntries(stage2Result.entries);

    logger.info(
      {
        docId: ctx.docId,
        entryCount: ledgerEntriesResult.length,
        wasArbitrated: stage2Result.wasArbitrated,
      },
      "Stage 2: Parsing completed"
    );

    return {
      ledgerEntries: ledgerEntriesResult,
      title: stage2Result.title,
      verificationStatus: "passed",
    };
  } catch (error) {
    // Handle Stage 2 arbitration failure
    if (error instanceof Error && error.message.includes("STAGE2_ARBITRATION_FAILED")) {
      logger.info({ docId: ctx.docId }, "Stage 2: Arbitration failed");
      return {
        ledgerEntries: [],
        anomalyReason: "Parsing results diverged",
        verificationStatus: "anomaly",
      };
    }
    throw error;
  }
}

export const parseSourceDocumentHandler: FlowTaskHandler<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  async execute(
    input: ParseSourceDocumentInput,
    context: FlowContext
  ): Promise<ParseSourceDocumentOutput> {
    const { signal, updateProgress, ai } = context;
    const { ledgerId } = input;

    if (ledgerId == null || ledgerId === "") throw new Error("Missing ledgerId in task input");

    // Validate document exists
    const doc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.id, input.sourceDocumentId), isNull(sourceDocuments.deletedAt)),
    });
    if (!doc) {
      throw new Error(`Source document not found: ${input.sourceDocumentId}`);
    }

    const q = forLedger(sourceDocuments, ledgerId);

    // Update status to processing
    await db
      .update(sourceDocuments)
      .set({ status: "processing" })
      .where(q.whereId(input.sourceDocumentId));

    const ctx: StageContext = {
      signal,
      ai,
      setProgress: updateProgress,
      docId: input.sourceDocumentId,
      ledgerId,
      q,
    };

    try {
      // ===== Stage 0: Vision Description =====
      const visionDescription = await runStage0(input, ctx);

      // ===== Stage 1: Pre-Analysis =====
      const stage1Results = await runStage1(input, visionDescription, ctx);

      // ===== Stage 1.5: Validation =====
      const validationResult = await runStage1_5(input, visionDescription, stage1Results, ctx);

      // ===== Stage 2: Detailed Parsing =====
      return await runStage2(input, visionDescription, validationResult, ctx);
    } catch (error) {
      // Handle stage result errors (special error format for early returns)
      if (error instanceof Error) {
        if (error.message.startsWith("STAGE1_RESULT:")) {
          return JSON.parse(error.message.slice("STAGE1_RESULT:".length));
        }
        if (error.message.startsWith("STAGE1_ANOMALY:")) {
          return {
            ledgerEntries: [],
            anomalyReason: error.message.slice("STAGE1_ANOMALY:".length),
            verificationStatus: "anomaly",
          };
        }
        if (error.message.startsWith("STAGE1_5_ANOMALY:")) {
          return {
            ledgerEntries: [],
            anomalyReason: error.message.slice("STAGE1_5_ANOMALY:".length),
            verificationStatus: "anomaly",
          };
        }
      }
      throw error;
    }
  },

  async onComplete(
    output: ParseSourceDocumentOutput,
    input: ParseSourceDocumentInput,
    _context: FlowContext
  ): Promise<void> {
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

  async onError(
    error: Error,
    input: ParseSourceDocumentInput,
    _context: FlowContext
  ): Promise<void> {
    logger.error(
      { error, sourceDocumentId: input.sourceDocumentId },
      "Parse source document task failed"
    );

    await handleParseError({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      error,
    });
  },

  async onCancel(input: ParseSourceDocumentInput, _context: FlowContext): Promise<void> {
    logger.info(
      { sourceDocumentId: input.sourceDocumentId },
      "Parse source document task cancelled"
    );

    await handleParseCancel({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
    });
  },
};

// Register the task handler
flowEngine.register(TASK_TYPE_PARSE_SOURCE_DOCUMENT, parseSourceDocumentHandler);
