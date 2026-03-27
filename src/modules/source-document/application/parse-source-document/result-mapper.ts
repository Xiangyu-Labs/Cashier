import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsedLedgerEntry } from "@/lib/ai/types";
import type { ParseSourceDocumentOutput } from "../tasks/parse-source-document";
import type { ParsePipelineResult } from "./contracts";
import type { ParsedEntry } from "./types";

export function convertToParsedEntries(entries: ParsedEntry[]): ParsedLedgerEntry[] {
  return entries.map((entry) => ({
    itemName: entry.item_name,
    amount: entry.amount,
    currency: entry.currency,
    categoryIndex: entry.category_index,
    entryDate: null,
    notes: entry.notes,
  }));
}

export function toParseSourceDocumentOutput(
  result: ParsePipelineResult
): ParseSourceDocumentOutput {
  switch (result.kind) {
    case "success":
      return {
        ledgerEntries: result.ledgerEntries,
        verificationStatus: "passed",
        ...(result.title !== undefined ? { title: result.title } : {}),
      };
    case "invalid":
      return {
        ledgerEntries: [],
        verificationStatus: "invalid",
      };
    case "anomaly":
      return {
        ledgerEntries: [],
        anomalyReason: result.anomalyReason,
        verificationStatus: "anomaly",
      };
    case "cancelled":
      throw new TaskCancelledError();
  }
}
