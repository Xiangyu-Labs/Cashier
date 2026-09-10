import { describe, it, expect } from "vitest";
import { ProcessingCancelledError } from "@/modules/source-document/application/parse-source-document/contracts";
import type { ParsePipelineResult } from "@/modules/source-document/application/parse-source-document/pipeline";
import {
  convertToParsedEntries,
  toParseSourceDocumentOutput,
} from "@/modules/source-document/application/parse-source-document/result-mapper";
import type {
  NormalizedLedgerEntry,
  NormalizedOrderAdjustment,
} from "@/modules/source-document/application/parse-source-document/parser-schema";

describe("convertToParsedEntries", () => {
  const item = (
    category_index = 1,
    receipt_index = 0,
    currency: NormalizedLedgerEntry["currency"] = "MYR"
  ): NormalizedLedgerEntry => ({
    receipt_index,
    item_name: "Meal",
    amount: "30",
    currency,
    category_index,
    notes: "Original price",
  });
  const adjustment = (
    amount: string,
    category_index = 0,
    receipt_index = 0,
    currency: NormalizedOrderAdjustment["currency"] = "MYR"
  ): NormalizedOrderAdjustment => ({
    receipt_index,
    item_name: "Adjustment",
    amount,
    currency,
    category_index,
  });

  it("preserves product prices and records shipping and discount in the shared category", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [item()],
      orderAdjustments: [adjustment("5"), adjustment("-8")],
    });
    expect(result.map((e) => [e.amount, e.categoryIndex, e.isAdjustment])).toEqual([
      ["30.00", 1, false],
      ["5.00", 1, true],
      ["-8.00", 1, true],
    ]);
    expect(result[0]).toMatchObject({
      notes: "Original price",
      entryDate: null,
      receiptIndex: 0,
      currency: "MYR",
    });
  });
  it("keeps mixed-category adjustments uncategorized unless explicitly attributed", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [item(1), item(2)],
      orderAdjustments: [adjustment("5"), adjustment("-8", 2)],
    });
    expect(result.slice(2).map((e) => e.categoryIndex)).toEqual([0, 2]);
  });

  it("keeps an explicit adjustment category when the receipt has one product category", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [item(1)],
      orderAdjustments: [adjustment("5", 2)],
    });

    expect(result[1]?.categoryIndex).toBe(2);
  });
  it("isolates categories by receipt and preserves each row's own currency precision", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [item(1, 0, "JPY"), item(2, 1, "KWD")],
      orderAdjustments: [adjustment("-1", 0, 0, "JPY"), adjustment("-0.123", 0, 1, "KWD")],
    });
    expect(result.map((e) => [e.amount, e.currency, e.categoryIndex])).toEqual([
      ["30", "JPY", 1],
      ["30.000", "KWD", 2],
      ["-1", "JPY", 1],
      ["-0.123", "KWD", 2],
    ]);
  });
  it("does not discard unmatched charges, invent categories, or retain zero adjustments", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [item(0)],
      orderAdjustments: [adjustment("0"), adjustment("5", 0, 1, "USD")],
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      amount: "5.00",
      currency: "USD",
      categoryIndex: 0,
      receiptIndex: 1,
    });
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

  it("maps invalid results to invalid output with title and reason", () => {
    const result: ParsePipelineResult = {
      kind: "invalid",
      title: "Blurred receipt",
      invalidReason: "Results inconsistent",
    };

    expect(toParseSourceDocumentOutput(result)).toEqual({
      ledgerEntries: [],
      title: "Blurred receipt",
      invalidReason: "Results inconsistent",
      verificationStatus: "invalid",
    });
  });

  it("throws when pipeline reports cancellation", () => {
    const result: ParsePipelineResult = { kind: "cancelled" };

    expect(() => toParseSourceDocumentOutput(result)).toThrow(ProcessingCancelledError);
  });
});
