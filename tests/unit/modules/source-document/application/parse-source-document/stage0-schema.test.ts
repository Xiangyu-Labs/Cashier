import { describe, expect, it } from "vitest";
import {
  compareResults,
  normalizeResult,
  shouldDualRun,
  parserOutputSchema as stage0ParseOutputSchema,
} from "@/modules/source-document/application/parse-source-document/parser-schema";

const simpleSuccess = {
  outcome: "success",
  title: "Coffee",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: 12.5, currency: "USD" }],
  ledger_entries: [
    {
      receipt_index: 0,
      item_name: "Coffee",
      amount: 12.5,
      currency: "USD",
      category_index: 1,
      notes: null,
    },
  ],
  order_adjustments: [],
  reasoning: "single item",
};

describe("stage0-schema", () => {
  it("normalizes optional strings and preserves receipt-adjustment structure", () => {
    const parsed = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    expect(parsed.ledger_entries[0]?.receipt_index).toBe(0);
    expect(parsed.order_adjustments).toEqual([]);
  });

  it("normalizes null notes to null", () => {
    const parsed = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    expect(parsed.ledger_entries[0]?.notes).toBeNull();
  });

  it("normalizes missing title to a non-empty fallback string", () => {
    const noTitle = { ...simpleSuccess };
    const { title: _t, ...withoutTitle } = noTitle;
    const parsed = normalizeResult(stage0ParseOutputSchema.parse(withoutTitle));
    expect(parsed.title).toBe("Untitled document");
  });

  it("uses invalid-content fallback title for invalid results missing title", () => {
    const parsed = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        outcome: "invalid",
        title: null,
        ledger_entries: [],
        receipt_totals: [],
      })
    );
    expect(parsed.title).toBe("Invalid content");
  });

  it("uses anomaly fallback title for anomaly results with blank title", () => {
    const parsed = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        outcome: "anomaly",
        title: "   ",
        anomaly_reason: "Image too blurry",
        ledger_entries: [],
        receipt_totals: [],
      })
    );
    expect(parsed.title).toBe("Unparseable document");
  });

  it("treats <=3 entries with one currency and no adjustments as simple", () => {
    const parsed = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    expect(shouldDualRun(parsed)).toBe(false);
  });

  it("requires dual-run when multiple currencies are present", () => {
    const multiCurrency = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        ledger_entries: [
          simpleSuccess.ledger_entries[0]!,
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Tea", currency: "GBP" },
        ],
      })
    );
    expect(shouldDualRun(multiCurrency)).toBe(true);
  });

  it("requires dual-run when >3 entries are present", () => {
    const complex = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        ledger_entries: [
          ...simpleSuccess.ledger_entries,
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Tea" },
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Cake" },
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Tip" },
        ],
      })
    );
    expect(shouldDualRun(complex)).toBe(true);
  });

  it("does not require dual-run for invalid or anomaly outcomes", () => {
    const invalid = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        outcome: "invalid",
        ledger_entries: [
          ...simpleSuccess.ledger_entries,
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Tea" },
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Cake" },
          { ...simpleSuccess.ledger_entries[0]!, item_name: "Tip" },
        ],
      })
    );
    expect(shouldDualRun(invalid)).toBe(false);
  });

  it("compares receipt totals, entries, and adjustments instead of only grouped sums", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        order_adjustments: [
          { receipt_index: 0, item_name: "Discount", amount: -2, currency: "USD" },
        ],
      })
    );
    expect(compareResults(left, right)).toBe(false);
  });


  it("treats different receipt totals as non-matching even when item and adjustment groupings match", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        receipt_totals: [{ receipt_index: 0, amount: 99.99, currency: "USD" }],
      })
    );

    expect(compareResults(left, right)).toBe(false);
  });

  it("treats identical results as matching", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    expect(compareResults(left, right)).toBe(true);
  });

  it("detects different entry amounts as non-matching", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        ledger_entries: [
          { ...simpleSuccess.ledger_entries[0]!, amount: 15.0 },
        ],
        receipt_totals: [{ receipt_index: 0, amount: 15.0, currency: "USD" }],
      })
    );
    expect(compareResults(left, right)).toBe(false);
  });

  it("normalizeResult returns anomaly when a ledger_entry has a non-positive amount", () => {
    const withZeroEntry = stage0ParseOutputSchema.parse({
      ...simpleSuccess,
      ledger_entries: [
        { ...simpleSuccess.ledger_entries[0]!, amount: 0 },
      ],
    });
    const result = normalizeResult(withZeroEntry);
    expect(result.outcome).toBe("anomaly");
  });

  it("normalizeResult returns anomaly when a ledger_entry has a negative amount", () => {
    const withNegativeEntry = stage0ParseOutputSchema.parse({
      ...simpleSuccess,
      ledger_entries: [
        { ...simpleSuccess.ledger_entries[0]!, amount: -5 },
      ],
    });
    const result = normalizeResult(withNegativeEntry);
    expect(result.outcome).toBe("anomaly");
  });

  it("accepts results within 0.01 tolerance as matching", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        ledger_entries: [
          { ...simpleSuccess.ledger_entries[0]!, amount: 12.505 },
        ],
        receipt_totals: [{ receipt_index: 0, amount: 12.505, currency: "USD" }],
      })
    );
    expect(compareResults(left, right)).toBe(true);
  });
});
