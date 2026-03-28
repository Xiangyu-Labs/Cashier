import { describe, it, expect } from "vitest";
import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsePipelineResult } from "@/modules/source-document/application/parse-source-document/contracts";
import {
  convertToParsedEntries,
  toParseSourceDocumentOutput,
} from "@/modules/source-document/application/parse-source-document/result-mapper";

describe("convertToParsedEntries", () => {
  it("keeps notes, forces entryDate to null, sets receiptIndex and isAdjustment false", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        {
          receipt_index: 2,
          item_name: "Lunch",
          amount: 10,
          currency: "USD",
          category_index: 1,
          notes: "team meal",
        },
      ],
      orderAdjustments: [],
    });

    expect(result).toEqual([
      {
        itemName: "Lunch",
        amount: 10,
        currency: "USD",
        categoryIndex: 1,
        entryDate: null,
        notes: "team meal",
        receiptIndex: 2,
        isAdjustment: false,
      },
    ]);
  });

  it("maps receipt index and adjustment flag into ParsedLedgerEntry", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 1, item_name: "Meal", amount: 10, currency: "USD", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 1, item_name: "Discount", amount: -2, currency: "USD" },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ itemName: "Meal", receiptIndex: 1, isAdjustment: false }),
      expect.objectContaining({ itemName: "Discount", receiptIndex: 1, isAdjustment: true, amount: -2 }),
    ]);
  });
});

describe("toParseSourceDocumentOutput", () => {
  it("maps success results to passed output", () => {
    const result: ParsePipelineResult = {
      kind: "success",
      title: "Receipt",
      ledgerEntries: [],
    };

    expect(toParseSourceDocumentOutput(result)).toEqual({
      ledgerEntries: [],
      title: "Receipt",
      verificationStatus: "passed",
    });
  });

  it("maps invalid results to invalid output", () => {
    const result: ParsePipelineResult = {
      kind: "invalid",
    };

    expect(toParseSourceDocumentOutput(result)).toEqual({
      ledgerEntries: [],
      verificationStatus: "invalid",
    });
  });

  it("maps anomaly results to anomaly output", () => {
    const result: ParsePipelineResult = {
      kind: "anomaly",
      anomalyReason: "Results inconsistent",
    };

    expect(toParseSourceDocumentOutput(result)).toEqual({
      ledgerEntries: [],
      anomalyReason: "Results inconsistent",
      verificationStatus: "anomaly",
    });
  });

  it("throws when pipeline reports cancellation", () => {
    const result: ParsePipelineResult = { kind: "cancelled" };

    expect(() => toParseSourceDocumentOutput(result)).toThrow(TaskCancelledError);
  });
});
