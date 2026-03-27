import type { ParsePipelineResult } from "./contracts";
import { convertToParsedEntries } from "./result-mapper";
import type { Stage2ExecutionResult } from "./stage2-executor";

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
    ledgerEntries: convertToParsedEntries(stage2Result.output.entries),
  };
}
