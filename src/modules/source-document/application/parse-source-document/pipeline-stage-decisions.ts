import type { ParsePipelineResult } from "./contracts";
import { convertToParsedEntries } from "./result-mapper";
import type { NormalizedStage0ParseOutput } from "./stage0-schema";

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

