import { logger } from "@/lib/logger";
import {
  ProcessingCancelledError,
  throwIfProcessingCancelled,
  type AiContextContract,
  type ParseSourceDocumentInput,
  type ParsePipelineResult,
} from "./contracts";
export type { ParsePipelineResult } from "./contracts";
import { executeParser } from "./parser";
import type { ParserInput } from "./parser";
import { arbitrateResults } from "./arbitration";
import { shouldDualRun, compareResults } from "./parser-schema";
import { convertToParsedEntries } from "./result-mapper";
import { reconcileParseOutput } from "./reconciliation";
import type { NormalizedParseOutput } from "./parser-schema";

// ===== Context =====

export interface StageContext {
  signal: AbortSignal;
  ai: AiContextContract;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
}

export function buildStageContext(params: {
  signal: AbortSignal;
  ai: AiContextContract;
  setProgress: (message: string) => Promise<void>;
  docId: string;
  ledgerId: string;
}): StageContext {
  return { ...params };
}

// ===== Result contract =====

// ===== Input mapping =====

export function buildParserInput(input: ParseSourceDocumentInput): ParserInput {
  return {
    originalCategories: input.categories.map((c) => ({
      name: c.name,
      description: c.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}

// ===== Outcome helpers =====

function resolveSuccess(
  result: NormalizedParseOutput,
  wasArbitrated: boolean
): Extract<ParsePipelineResult, { kind: "success" }> {
  return {
    kind: "success",
    title: result.title,
    ledgerEntries: convertToParsedEntries({
      ledgerEntries: result.ledger_entries,
      orderAdjustments: result.order_adjustments,
    }),
    wasArbitrated,
  };
}

async function persistAndResolveSuccess({
  aiLanguage,
  result,
  wasArbitrated,
  ctx: _ctx,
}: {
  aiLanguage: string | undefined;
  result: NormalizedParseOutput;
  wasArbitrated: boolean;
  ctx: StageContext;
}): Promise<ParsePipelineResult> {
  const reconciled =
    aiLanguage === undefined
      ? reconcileParseOutput({ result })
      : reconcileParseOutput({ aiLanguage, result });
  if (reconciled.kind === "anomaly") {
    return {
      kind: "anomaly",
      title: result.title,
      anomalyReason: reconciled.reason,
    };
  }

  return resolveSuccess(reconciled.result, wasArbitrated);
}

function resolveOutcome(
  result: NormalizedParseOutput
): ParsePipelineResult | { kind: "continue"; result: NormalizedParseOutput } {
  if (result.outcome === "invalid") return { kind: "invalid", title: result.title };
  if (result.outcome === "anomaly") {
    return {
      kind: "anomaly",
      title: result.title,
      anomalyReason: result.anomaly_reason ?? "Document cannot be parsed",
    };
  }
  return { kind: "continue", result };
}

// ===== Pipeline =====

export async function runParsePipeline(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<ParsePipelineResult> {
  try {
    throwIfProcessingCancelled(ctx.signal);
    await ctx.setProgress("正在解析单据...");

    const parserInput = buildParserInput(input);
    const first = await executeParser(parserInput, ctx.ai);

    throwIfProcessingCancelled(ctx.signal);

    // Short-circuit: invalid or anomaly
    const firstDecision = resolveOutcome(first);
    if (firstDecision.kind !== "continue") return firstDecision;

    // Simple document: single pass is sufficient
    if (!shouldDualRun(first)) {
      return persistAndResolveSuccess({
        aiLanguage: input.aiLanguage,
        result: first,
        wasArbitrated: false,
        ctx,
      });
    }

    // Complex document: run a second pass
    await ctx.setProgress("正在进行二次解析...");
    throwIfProcessingCancelled(ctx.signal);

    const second = await executeParser(parserInput, ctx.ai);
    throwIfProcessingCancelled(ctx.signal);

    // Both passes agree: use first result
    if (compareResults(first, second)) {
      logger.info(
        { docId: ctx.docId, entries: first.ledger_entries.length },
        "parser: dual-run results agree"
      );
      return persistAndResolveSuccess({
        aiLanguage: input.aiLanguage,
        result: first,
        wasArbitrated: false,
        ctx,
      });
    }

    // Results disagree: arbitrate
    throwIfProcessingCancelled(ctx.signal);
    await ctx.setProgress("正在仲裁单据解析结果...");

    logger.info({ docId: ctx.docId }, "parser: dual-run disagrees, arbitrating");
    const arbitration = await arbitrateResults(
      { input: parserInput, result1: first, result2: second },
      ctx.ai
    );

    throwIfProcessingCancelled(ctx.signal);

    if (arbitration.kind === "anomaly") {
      return {
        kind: "anomaly",
        title: first.title,
        anomalyReason: arbitration.reason,
      };
    }

    return persistAndResolveSuccess({
      aiLanguage: input.aiLanguage,
      result: arbitration.result,
      wasArbitrated: true,
      ctx,
    });
  } catch (error) {
    if (error instanceof ProcessingCancelledError) {
      return { kind: "cancelled" };
    }
    throw error;
  }
}
