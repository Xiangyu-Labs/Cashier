import type { ParsedLedgerEntry } from "@/lib/ai/types";
import type { Stage1Results, ValidationSummary } from "./types";

export type ParsePipelineResult =
  | {
      kind: "success";
      title?: string;
      ledgerEntries: ParsedLedgerEntry[];
    }
  | {
      kind: "invalid";
    }
  | {
      kind: "anomaly";
      anomalyReason: string;
    }
  | {
      kind: "cancelled";
    };

export type Stage1ExecutionResult =
  | {
      kind: "continue";
      results: Stage1Results;
    }
  | Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }>;

export type Stage1ValidationResult =
  | {
      kind: "continue";
      validationResult: ValidationSummary;
    }
  | Extract<ParsePipelineResult, { kind: "anomaly" }>;
