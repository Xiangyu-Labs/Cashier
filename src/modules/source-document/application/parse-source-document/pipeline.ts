import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { TaskCancelledError, throwIfCancelled } from "@/lib/flow/cancellation";
import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { StageContext } from "./context";
import type { ParsePipelineResult } from "./contracts";
import { executeStage0 } from "./stage0-vision";
import { arbitrateStage0Results } from "./stage0-arbitration";
import { shouldDualRun, compareResults } from "./stage0-schema";
import { sourceDocumentNotDeletedCondition } from "../source-document-state";
import {
  resolveStage0Outcome,
  resolveStage0Success,
} from "./pipeline-stage-decisions";
import { buildStage0Input } from "./pipeline-stage-inputs";

export { buildStage1Input } from "./pipeline-stage-inputs";

async function persistStage0Result(
  result: unknown,
  ctx: StageContext
): Promise<void> {
  const doc = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.id, ctx.docId),
      sourceDocumentNotDeletedCondition()
    ),
  });
  if (doc != null) {
    const existingMeta = (doc.metadata as Record<string, unknown>) ?? {};
    await db
      .update(sourceDocuments)
      .set({
        metadata: {
          ...existingMeta,
          stage0Result: result as Record<string, unknown>,
        },
      })
      .where(
        and(
          eq(sourceDocuments.id, ctx.docId),
          sourceDocumentNotDeletedCondition()
        )
      );
  }
}

export async function runParsePipeline(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<ParsePipelineResult> {
  try {
    throwIfCancelled(ctx.signal);
    await ctx.setProgress("正在解析单据...");

    const stage0Input = buildStage0Input(input);
    const first = await executeStage0(stage0Input, ctx.ai);

    throwIfCancelled(ctx.signal);

    // Short-circuit: invalid or anomaly
    const firstDecision = resolveStage0Outcome(first);
    if (firstDecision.kind !== "continue") {
      logger.info({ docId: ctx.docId, outcome: first.outcome }, "stage0: non-success outcome");
      return firstDecision;
    }

    // Simple document: accept first-pass result immediately
    if (!shouldDualRun(first)) {
      logger.info(
        { docId: ctx.docId, entries: first.ledger_entries.length },
        "stage0: simple document, accepting first pass"
      );
      await persistStage0Result(first, ctx);
      return resolveStage0Success(first, false);
    }

    // Complex document: run a second pass
    throwIfCancelled(ctx.signal);
    await ctx.setProgress("正在二次验证单据...");

    const second = await executeStage0(stage0Input, ctx.ai);

    throwIfCancelled(ctx.signal);

    // If second pass is also non-success, report anomaly
    if (second.outcome !== "success") {
      return {
        kind: "anomaly",
        anomalyReason: second.anomaly_reason ?? "Second parse pass returned non-success",
      };
    }

    // If both agree, accept the first result
    if (compareResults(first, second)) {
      logger.info(
        { docId: ctx.docId, entries: first.ledger_entries.length },
        "stage0: dual-run results agree"
      );
      await persistStage0Result(first, ctx);
      return resolveStage0Success(first, false);
    }

    // Results disagree: arbitrate
    throwIfCancelled(ctx.signal);
    await ctx.setProgress("正在仲裁单据解析结果...");

    logger.info({ docId: ctx.docId }, "stage0: dual-run disagrees, arbitrating");
    const arbitration = await arbitrateStage0Results(
      { input: stage0Input, result1: first, result2: second },
      ctx.ai
    );

    throwIfCancelled(ctx.signal);

    if (arbitration.kind === "anomaly") {
      return { kind: "anomaly", anomalyReason: arbitration.reason };
    }

    await persistStage0Result(arbitration.result, ctx);
    return resolveStage0Success(arbitration.result, true);
  } catch (error) {
    if (error instanceof TaskCancelledError) {
      return { kind: "cancelled" };
    }
    throw error;
  }
}
