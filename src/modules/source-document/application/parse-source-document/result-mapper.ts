import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsedLedgerEntry } from "@/lib/ai/types";
import type { ParseSourceDocumentOutput } from "../tasks/parse-source-document";
import type { ParsePipelineResult } from "./contracts";
import type { NormalizedLedgerEntry, NormalizedOrderAdjustment } from "./stage0-schema";

export function convertToParsedEntries({
  ledgerEntries,
  orderAdjustments,
}: {
  ledgerEntries: NormalizedLedgerEntry[];
  orderAdjustments: NormalizedOrderAdjustment[];
}): ParsedLedgerEntry[] {
  const entries: ParsedLedgerEntry[] = ledgerEntries.map((entry) => ({
    itemName: entry.item_name,
    amount: entry.amount,
    currency: entry.currency,
    categoryIndex: entry.category_index,
    entryDate: null,
    notes: entry.notes,
    receiptIndex: entry.receipt_index,
    isAdjustment: false,
  }));

  const adjustments: ParsedLedgerEntry[] = orderAdjustments.map((adj) => ({
    itemName: adj.item_name,
    amount: adj.amount,
    currency: adj.currency,
    categoryIndex: 0,
    entryDate: null,
    notes: null,
    receiptIndex: adj.receipt_index,
    isAdjustment: true,
  }));

  return [...entries, ...adjustments];
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
