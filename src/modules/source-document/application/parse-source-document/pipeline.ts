import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ArbitrationFailedError } from "@/lib/ai/dual-gpt-runner";
import { TaskCancelledError, throwIfCancelled } from "@/lib/flow/cancellation";
import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { StageContext } from "./context";
import type { ParsePipelineResult, Stage1ExecutionResult, Stage1ValidationResult } from "./contracts";
import { executeStage0 } from "./stage0-vision";
import { executeStage1 } from "./stage1-executor";
import { executeStage1_5Validation } from "./stage1-5-validator";
import { executeStage2 } from "./stage2-executor";
import type { Stage1Results, ValidationSummary } from "./types";
import {
  sourceDocumentNotDeletedCondition,
  whereSourceDocumentNotDeletedId,
} from "../source-document-state";
import {
  resolveStage1ExecutionResult,
  resolveStage1ValidationResult,
  resolveStage2ExecutionResult,
} from "./pipeline-stage-decisions";
import {
  buildStage1Input,
  buildStage1ValidationInput,
  buildStage2Input,
} from "./pipeline-stage-inputs";

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

  const stage1Decision = resolveStage1ExecutionResult(stage1Result);
  if (stage1Decision.kind !== "continue") {
    logger.info({ docId: ctx.docId, kind: stage1Decision.kind }, "Stage 1 finished early");
    return stage1Decision;
  }

  logger.info(
    {
      docId: ctx.docId,
      currencies: stage1Decision.results.currency.currencies,
      categories: stage1Decision.results.category.categories,
    },
    "Stage 1: Pre-analysis completed"
  );

  return {
    kind: "continue",
    results: stage1Decision.results,
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
    buildStage1ValidationInput(input, visionDescription, stage1Results),
    ctx.ai
  );

  const validationDecision = resolveStage1ValidationResult(validationResult);
  if (validationDecision.kind !== "continue") {
    logger.info(
      {
        docId: ctx.docId,
        reason: validationResult.rejection_reason,
      },
      "Stage 1.5: Validation rejected"
    );
    return validationDecision;
  }

  return {
    kind: "continue",
    validationResult: validationDecision.validationResult,
  };
}

async function runStage2(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  validationResult: ValidationSummary,
  ctx: StageContext
): Promise<Extract<ParsePipelineResult, { kind: "success" | "anomaly" }>> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在生成账单条目...");

  const stage2Result = await executeStage2(
    buildStage2Input(input, visionDescription, validationResult),
    ctx.ai
  );

  if (stage2Result.kind === "anomaly") {
    logger.info({ docId: ctx.docId }, "Stage 2: Arbitration failed");
    return resolveStage2ExecutionResult(stage2Result);
  }

  const stage2Decision = resolveStage2ExecutionResult(stage2Result);
  if (stage2Decision.kind !== "success") {
    return stage2Decision;
  }
  logger.info(
    {
      docId: ctx.docId,
      entryCount: stage2Decision.ledgerEntries.length,
      wasArbitrated: stage2Result.output.wasArbitrated,
    },
    "Stage 2: Parsing completed"
  );

  return stage2Decision;
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

    return await runStage2(input, visionDescription, validationResult.validationResult, ctx);
  } catch (error) {
    if (error instanceof TaskCancelledError) {
      return { kind: "cancelled" };
    }
    throw error;
  }
}
