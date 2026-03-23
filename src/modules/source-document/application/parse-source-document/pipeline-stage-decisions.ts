import type { ParsePipelineResult } from "./contracts";
import { convertToParsedEntries } from "./result-mapper";
import type { Stage2ExecutionResult } from "./stage2-executor";
import type { Stage1Results, ValidationSummary } from "./types";

type RawStage1Execution =
  | { isValid: false; title: string }
  | { isValid: true; isIncomplete: true; incompleteReason?: string; title: string }
  | { isValid: true; isIncomplete: false; results: Stage1Results };

function isUnknownCurrency(currency: string): boolean {
  const normalized = currency.trim().toLowerCase();
  return normalized === "" || normalized === "unknown" || normalized === "undefined";
}

export function resolveStage1ExecutionResult(
  stage1Result: RawStage1Execution
):
  | Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }>
  | { kind: "continue"; results: Stage1Results } {
  if (!stage1Result.isValid) {
    return { kind: "invalid", title: stage1Result.title };
  }

  if (stage1Result.isIncomplete) {
    return {
      kind: "anomaly",
      anomalyReason: stage1Result.incompleteReason ?? "Content incomplete",
      title: stage1Result.title,
    };
  }

  if (stage1Result.results.currency.currencies.some(isUnknownCurrency)) {
    return {
      kind: "anomaly",
      anomalyReason: "Unable to recognize currency type",
    };
  }

  return { kind: "continue", results: stage1Result.results };
}

export function resolveStage1ValidationResult(
  validationResult: ValidationSummary
):
  | Extract<ParsePipelineResult, { kind: "anomaly" }>
  | { kind: "continue"; validationResult: ValidationSummary } {
  if (!validationResult.is_reasonable) {
    return {
      kind: "anomaly",
      anomalyReason: validationResult.rejection_reason ?? "Pre-analysis results invalid",
    };
  }

  return { kind: "continue", validationResult };
}

export function resolveStage2ExecutionResult(
  stage2Result: Stage2ExecutionResult
): Extract<ParsePipelineResult, { kind: "success" | "anomaly" }> {
  if (stage2Result.kind === "anomaly") {
    return {
      kind: "anomaly",
      anomalyReason: "Parsing results diverged",
    };
  }

  return {
    kind: "success",
    title: stage2Result.output.title,
    ledgerEntries: convertToParsedEntries(stage2Result.output.entries),
  };
}
