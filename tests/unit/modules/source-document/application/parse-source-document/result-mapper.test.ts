import { describe, it, expect } from "vitest";
import { TaskCancelledError } from "@/lib/flow/cancellation";
import type { ParsePipelineResult } from "@/modules/source-document/application/parse-source-document/pipeline";
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

  it("folds a same-currency adjustment into the single matching entry", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 1, item_name: "Meal", amount: 10, currency: "USD", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 1, item_name: "Discount", amount: -2, currency: "USD" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemName: "Meal", amount: 8, currency: "USD", isAdjustment: false });
  });

  it("distributes adjustment proportionally across multiple entries", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "A", amount: 10, currency: "CNY", category_index: 1, notes: null },
        { receipt_index: 0, item_name: "B", amount: 20, currency: "CNY", category_index: 1, notes: null },
        { receipt_index: 0, item_name: "C", amount: 30, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 0, item_name: "Service fee", amount: -6, currency: "CNY" },
      ],
    });

    // Total = 60, adjustment = -6. Shares: A=-1, B=-2, C=-3
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ itemName: "A", amount: 9 });
    expect(result[1]).toMatchObject({ itemName: "B", amount: 18 });
    expect(result[2]).toMatchObject({ itemName: "C", amount: 27 });
  });

  it("gives rounding remainder to last entry so total is preserved", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "X", amount: 10, currency: "CNY", category_index: 1, notes: null },
        { receipt_index: 0, item_name: "Y", amount: 20, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 0, item_name: "Rounding", amount: -0.1, currency: "CNY" },
      ],
    });

    // Total = 30, adjustment = -0.1. X share = -0.03, Y gets remainder = -0.07
    const total = (result[0]?.amount ?? 0) + (result[1]?.amount ?? 0);
    expect(Math.round(total * 100)).toBe(2990); // 29.90 in cents
    expect(result).toHaveLength(2);
    expect(result.every((e) => !e.isAdjustment)).toBe(true);
  });

  it("folds adjustment by receipt_index regardless of currency field on adjustment", () => {
    // A receipt has one currency; the adjustment's currency field is irrelevant for matching.
    // receipt_index 0 has one CNY entry → adjustment folds in regardless of adj.currency value.
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "Item", amount: 10, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 0, item_name: "Fee", amount: -1, currency: "USD" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemName: "Item", amount: 9, isAdjustment: false });
  });

  it("drops adjustment when its receipt_index has no matching entries", () => {
    // receipt_index: 1 has no ledger entries → adjustment is silently dropped.
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "Item", amount: 10, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 1, item_name: "Discount", amount: -2, currency: "CNY" },
      ],
    });

    // Orphaned adjustment is dropped — no separate row
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemName: "Item", amount: 10, isAdjustment: false });
  });

  it("returns entries unchanged when there are no adjustments", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "Tea", amount: 5, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemName: "Tea", amount: 5, isAdjustment: false });
  });

  it("aggregates multiple adjustments before distributing", () => {
    const result = convertToParsedEntries({
      ledgerEntries: [
        { receipt_index: 0, item_name: "Item", amount: 100, currency: "CNY", category_index: 1, notes: null },
      ],
      orderAdjustments: [
        { receipt_index: 0, item_name: "Discount", amount: -10, currency: "CNY" },
        { receipt_index: 0, item_name: "Tax", amount: 5, currency: "CNY" },
      ],
    });

    // Net adjustment = -5, single entry absorbs all
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amount: 95 });
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
