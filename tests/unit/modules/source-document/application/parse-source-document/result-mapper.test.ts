import { describe, it, expect } from "vitest";
import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsePipelineResult } from "../../../../../../src/modules/source-document/application/parse-source-document/contracts";
import { convertToParsedEntries, toParseSourceDocumentOutput } from "../../../../../../src/modules/source-document/application/parse-source-document/result-mapper";

describe("convertToParsedEntries", () => {
  it("keeps notes and forces entryDate to null", () => {
    const result = convertToParsedEntries([
      {
        item_name: "Lunch",
        amount: 10,
        currency: "USD",
        category_index: 1,
        entry_date: "2024-01-01",
        notes: "team meal",
      },
    ]);

    expect(result).toEqual([
      {
        itemName: "Lunch",
        amount: 10,
        currency: "USD",
        categoryIndex: 1,
        entryDate: null,
        notes: "team meal",
      },
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
      title: "Not a receipt",
    };

    expect(toParseSourceDocumentOutput(result)).toEqual({
      ledgerEntries: [],
      title: "Not a receipt",
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
