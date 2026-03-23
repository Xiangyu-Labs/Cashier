import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ArbitrationFailedError } from "@/lib/ai/dual-gpt-runner";
import { TaskCancelledError, throwIfCancelled } from "@/lib/flow/cancellation";
import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { StageContext } from "./context";
import type {
  ParsePipelineResult,
  Stage1ExecutionResult,
  Stage1ValidationResult,
} from "./contracts";
import { executeStage0 } from "./stage0-vision";
import { executeStage1, type Stage1Input } from "./stage1-executor";
import { executeStage1_5Validation } from "./stage1-5-validator";
import { executeStage2 } from "./stage2-executor";
import { convertToParsedEntries } from "./result-mapper";
import type { Stage1Results } from "./types";
import {
  sourceDocumentNotDeletedCondition,
  whereSourceDocumentNotDeletedId,
} from "../source-document-state";

export function buildStage1Input(
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

function checkStage1Results(
  stage1Result: Awaited<ReturnType<typeof executeStage1>>,
  docId: string
): Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }> | null {
  if (!stage1Result.isValid) {
    logger.info({ docId }, "Stage 1: Document invalid");
    return { kind: "invalid", title: stage1Result.title };
  }

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

  const currencies = stage1Result.results.currency.currencies;
  const hasUnknownCurrency = currencies.some(
    (currency) =>
      currency === "" ||
      currency.toLowerCase() === "unknown" ||
      currency.toLowerCase() === "undefined"
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

async function runStage0(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<string | undefined> {
  if (input.imageUrls == null || input.imageUrls.length === 0) {
    return undefined;
  }

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
    const doc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.id, ctx.docId), sourceDocumentNotDeletedCondition()),
    });
    if (doc != null) {
      await db
        .update(sourceDocuments)
        .set({ metadata: { ...doc.metadata, visionDescription: stage0Result.description } })
        .where(whereSourceDocumentNotDeletedId(ctx.ledgerId, ctx.docId));
    }
    return stage0Result.description;
  }

  return undefined;
}

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
  if (failureResult != null) {
    return failureResult;
  }

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

  const ledgerEntries = convertToParsedEntries(stage2Result.output.entries);

  logger.info(
    {
      docId: ctx.docId,
      entryCount: ledgerEntries.length,
      wasArbitrated: stage2Result.output.wasArbitrated,
    },
    "Stage 2: Parsing completed"
  );

  return {
    kind: "success",
    title: stage2Result.output.title,
    ledgerEntries,
  };
}

export async function runParsePipeline(
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
