import type { FlowTaskDefinition, FlowTaskHandler, FlowContext } from "@/lib/flow";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { type CategoryInfo, type ParsedLedgerEntry } from "@/lib/ai/types";
import type { AIContext } from "@/lib/flow/types";
import { logger } from "@/lib/logger";
import { forLedger } from "@/lib/db/scoped-query";
import { ArbitrationFailedError } from "@/lib/ai/dual-gpt-runner";
import { TaskCancelledError, throwIfCancelled } from "@/lib/flow/cancellation";
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

type ParsePipelineResult =
  | {
      kind: "success";
      title?: string;
      ledgerEntries: ParsedLedgerEntry[];
    }
  | {
      kind: "invalid";
      title?: string;
    }
  | {
      kind: "anomaly";
      anomalyReason: string;
      title?: string;
    }
  | {
      kind: "cancelled";
    };

type Stage1ExecutionResult =
  | {
      kind: "continue";
      results: Stage1Results;
    }
  | Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }>;

type Stage1ValidationResult =
  | {
      kind: "continue";
      validationResult: Awaited<ReturnType<typeof executeStage1_5Validation>>;
    }
  | Extract<ParsePipelineResult, { kind: "anomaly" }>;

function toParseSourceDocumentOutput(result: ParsePipelineResult): ParseSourceDocumentOutput {
  switch (result.kind) {
    case "success":
      return {
        ledgerEntries: result.ledgerEntries,
        verificationStatus: "passed",
        ...(result.title !== undefined ? { title: result.title } : {}),
      };
    case "invalid":
      return {
        ledgerEntries: [],
        verificationStatus: "invalid",
        ...(result.title !== undefined ? { title: result.title } : {}),
      };
    case "anomaly":
      return {
        ledgerEntries: [],
        anomalyReason: result.anomalyReason,
        verificationStatus: "anomaly",
        ...(result.title !== undefined ? { title: result.title } : {}),
      };
    case "cancelled":
      throw new TaskCancelledError();
  }
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

  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在读取图片...");

  const stage0Result = await executeStage0(
    {
      imageUrls: input.imageUrls,
      ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    },
    ctx.ai
  );

  throwIfCancelled(ctx.signal);

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
    categories: input.categories.map((c) => ({ name: c.name, description: c.description ?? null })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}

/**
 * Check Stage 1 results for various failure conditions
 */
function checkStage1Results(
  stage1Result: Awaited<ReturnType<typeof executeStage1>>,
  docId: string
): Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }> | null {
  // Check validity from Stage 1
  if (!stage1Result.isValid) {
    logger.info({ docId }, "Stage 1: Document invalid");
    return { kind: "invalid", title: stage1Result.title };
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
      kind: "anomaly",
      anomalyReason: stage1Result.incompleteReason ?? "Content incomplete",
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
      kind: "anomaly",
      anomalyReason: "Unable to recognize currency type",
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
): Promise<Stage1ExecutionResult> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在分析单据信息...");

  const stage1Input = buildStage1Input(input, visionDescription);

  let stage1Result;
  try {
    stage1Result = await executeStage1(stage1Input, ctx.ai, ctx.signal);
  } catch (error) {
    if (error instanceof ArbitrationFailedError) {
      logger.info({ docId: ctx.docId, error: error.message }, "Stage 1: Arbitration failed");
      return {
        kind: "anomaly",
        anomalyReason: "Pre-analysis results diverged",
      };
    }
    throw error;
  }

  const failureResult = checkStage1Results(stage1Result, ctx.docId);
  if (failureResult) {
    return failureResult;
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

  return {
    kind: "continue",
    results: resultWithData.results,
  };
}

/**
 * Run Stage 1.5: Validation
 */
async function runStage1_5(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  stage1Results: Stage1Results,
  ctx: StageContext
): Promise<Stage1ValidationResult> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在核对分析结果...");

  const validationResult = await executeStage1_5Validation(
    {
      stage1Results,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
      ...(visionDescription !== undefined ? { visionDescription } : {}),
      ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
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
    return {
      kind: "anomaly",
      anomalyReason: validationResult.rejection_reason ?? "Pre-analysis results invalid",
    };
  }

  return {
    kind: "continue",
    validationResult,
  };
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
): Promise<Extract<ParsePipelineResult, { kind: "success" | "anomaly" }>> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在生成账单条目...");
  const stage2Result = await executeStage2(
    {
      validationSummary: validationResult,
      originalCategories: input.categories.map((c) => ({
        name: c.name,
        description: c.description ?? null,
      })),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
      ...(visionDescription !== undefined ? { visionDescription } : {}),
      ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    },
    ctx.ai
  );

  if (stage2Result.kind === "anomaly") {
    logger.info({ docId: ctx.docId }, "Stage 2: Arbitration failed");
    return {
      kind: "anomaly",
      anomalyReason: "Parsing results diverged",
    };
  }

  const ledgerEntriesResult = convertToParsedEntries(stage2Result.output.entries);

  logger.info(
    {
      docId: ctx.docId,
      entryCount: ledgerEntriesResult.length,
      wasArbitrated: stage2Result.output.wasArbitrated,
    },
    "Stage 2: Parsing completed"
  );

  return {
    kind: "success",
    title: stage2Result.output.title,
    ledgerEntries: ledgerEntriesResult,
  };
}

async function runParsePipeline(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<ParsePipelineResult> {
  try {
    const visionDescription = await runStage0(input, ctx);
    const stage1Result = await runStage1(input, visionDescription, ctx);

    if (stage1Result.kind !== "continue") {
      return stage1Result;
    }

    const validationResult = await runStage1_5(input, visionDescription, stage1Result.results, ctx);
    if (validationResult.kind !== "continue") {
      return validationResult;
    }

    return runStage2(input, visionDescription, validationResult.validationResult, ctx);
  } catch (error) {
    if (error instanceof TaskCancelledError) {
      return { kind: "cancelled" };
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

    const pipelineResult = await runParsePipeline(input, ctx);
    return toParseSourceDocumentOutput(pipelineResult);
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
      verificationStatus: output.verificationStatus,
      categories: input.categories,
      ...(output.title !== undefined ? { title: output.title } : {}),
      ...(output.anomalyReason !== undefined ? { anomalyReason: output.anomalyReason } : {}),
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

export const parseSourceDocumentTaskDefinition: FlowTaskDefinition<
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput
> = {
  type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
  handler: parseSourceDocumentHandler,
};
