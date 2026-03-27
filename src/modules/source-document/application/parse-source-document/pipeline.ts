import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { TaskCancelledError, throwIfCancelled } from "@/lib/flow/cancellation";
import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { StageContext } from "./context";
import type { ParsePipelineResult } from "./contracts";
import { executeStage0 } from "./stage0-vision";
import { executeStage1 } from "./stage1-executor";
import { executeStage2 } from "./stage2-executor";
import type { DocumentUnderstanding } from "./types";
import {
  sourceDocumentNotDeletedCondition,
} from "../source-document-state";
import {
  resolveStage1Result,
  resolveStage2ExecutionResult,
} from "./pipeline-stage-decisions";
import {
  buildStage1Input,
  buildStage2Input,
} from "./pipeline-stage-inputs";

async function runStage0(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<DocumentUnderstanding | undefined> {
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

  // Persist structured understanding to metadata
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, ctx.docId), sourceDocumentNotDeletedCondition()),
  });
  if (doc != null) {
    const existingMeta = (doc.metadata as Record<string, unknown>) ?? {};
    await db
      .update(sourceDocuments)
      .set({
        metadata: {
          ...existingMeta,
          visionUnderstanding: stage0Result as unknown as Record<string, unknown>,
        },
      })
      .where(and(eq(sourceDocuments.id, ctx.docId), sourceDocumentNotDeletedCondition()));
  }

  return stage0Result;
}

async function runStage1(
  input: ParseSourceDocumentInput,
  documentUnderstanding: DocumentUnderstanding | undefined,
  ctx: StageContext
): Promise<ParsePipelineResult | { kind: "continue" }> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在分析单据信息...");

  throwIfCancelled(ctx.signal);

  const stage1Input = buildStage1Input(input, documentUnderstanding);
  const stage1Result = await executeStage1(stage1Input, ctx.ai);

  const decision = resolveStage1Result(stage1Result);
  if (decision.kind !== "continue") {
    logger.info({ docId: ctx.docId, reasoning: stage1Result.reasoning }, "Stage 1: Document invalid");
    return decision;
  }

  return { kind: "continue" };
}

async function runStage2(
  input: ParseSourceDocumentInput,
  documentUnderstanding: DocumentUnderstanding | undefined,
  ctx: StageContext
): Promise<ParsePipelineResult> {
  throwIfCancelled(ctx.signal);
  await ctx.setProgress("正在解析账目数据...");

  const stage2Input = buildStage2Input(input, documentUnderstanding);
  const stage2Result = await executeStage2(stage2Input, ctx.ai);

  if (stage2Result.kind === "anomaly") {
    logger.info({ docId: ctx.docId }, "Stage 2: Arbitration failed or anomaly");
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
    const documentUnderstanding = await runStage0(input, ctx);
    const stage1Result = await runStage1(input, documentUnderstanding, ctx);

    if (stage1Result.kind !== "continue") {
      return stage1Result;
    }

    return await runStage2(input, documentUnderstanding, ctx);
  } catch (error) {
    if (error instanceof TaskCancelledError) {
      return { kind: "cancelled" };
    }
    throw error;
  }
}
