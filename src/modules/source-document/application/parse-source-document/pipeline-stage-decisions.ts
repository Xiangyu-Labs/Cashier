import type { ParsePipelineResult } from "./contracts";
import { convertToParsedEntries } from "./result-mapper";
import type { NormalizedStage0ParseOutput } from "./stage0-schema";
import type { Stage2ExecutionResult } from "./stage2-executor";

export function resolveStage0Success(
  result: NormalizedStage0ParseOutput,
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

export function resolveStage0Outcome(
  result: NormalizedStage0ParseOutput
): ParsePipelineResult | { kind: "continue"; result: NormalizedStage0ParseOutput } {
  if (result.outcome === "invalid") return { kind: "invalid" };
  if (result.outcome === "anomaly") {
    return {
      kind: "anomaly",
      anomalyReason: result.anomaly_reason ?? "Document cannot be parsed",
    };
  }
  return { kind: "continue", result };
}

export function resolveStage1Result(
  stage1Result: { isValid: boolean; reasoning: string }
): Extract<ParsePipelineResult, { kind: "invalid" }> | { kind: "continue" } {
  if (!stage1Result.isValid) {
    return { kind: "invalid" };
  }
  return { kind: "continue" };
}

export function resolveStage2ExecutionResult(
  stage2Result: Stage2ExecutionResult
): Extract<ParsePipelineResult, { kind: "success" | "anomaly" }> {
  if (stage2Result.kind === "anomaly") {
    return {
      kind: "anomaly",
      anomalyReason: stage2Result.reason,
    };
  }

  return {
    kind: "success",
    title: stage2Result.output.title,
    ledgerEntries: convertToParsedEntries({
      ledgerEntries: stage2Result.output.entries.map((e) => ({ ...e, receipt_index: 0 })),
      orderAdjustments: [],
    }),
  };
}
