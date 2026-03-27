import type { ParsedLedgerEntry } from "@/lib/ai/types";

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

