import { describe, expect, it } from "vitest";
import {
  normalizeResult,
  parserOutputSchema,
} from "@/modules/source-document/application/parse-source-document/parser-schema";

const simpleSuccess = {
  outcome: "success",
  title: "Coffee",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "USD" }],
  ledger_entries: [
    {
      receipt_index: 0,
      item_name: "Coffee",
      amount: "12.50",
      currency: "USD",
      category_index: 1,
      notes: null,
    },
  ],
  order_adjustments: [],
  reasoning: "single item",
};

describe("parser-schema", () => {
  it("normalizes optional strings and preserves receipt-adjustment structure", () => {
    const parsed = normalizeResult(parserOutputSchema.parse(simpleSuccess));
    expect(parsed.ledger_entries[0]?.receipt_index).toBe(0);
    expect(parsed.order_adjustments).toEqual([]);
  });

  it("normalizes null notes to null", () => {
    const parsed = normalizeResult(parserOutputSchema.parse(simpleSuccess));
    expect(parsed.ledger_entries[0]?.notes).toBeNull();
  });

  it("normalizes missing title to a non-empty fallback string", () => {
    const noTitle = { ...simpleSuccess };
    const { title: _t, ...withoutTitle } = noTitle;
    const parsed = normalizeResult(parserOutputSchema.parse(withoutTitle));
    expect(parsed.title).toBe("Untitled document");
  });

  it("uses invalid-content fallback title for invalid results missing title", () => {
    const parsed = normalizeResult(
      parserOutputSchema.parse({
        ...simpleSuccess,
        outcome: "invalid",
        title: null,
        ledger_entries: [],
        receipt_totals: [],
      })
    );
    expect(parsed.title).toBe("Invalid content");
  });

  it("uses invalid-content fallback title for invalid results with a reason", () => {
    const parsed = normalizeResult(
      parserOutputSchema.parse({
        ...simpleSuccess,
        outcome: "invalid",
        title: "   ",
        invalid_reason: "Image too blurry",
        ledger_entries: [],
        receipt_totals: [],
      })
    );
    expect(parsed.title).toBe("Invalid content");
  });

  it("uses a localized fallback title for the target AI language", () => {
    const parsed = normalizeResult(
      parserOutputSchema.parse({ ...simpleSuccess, title: null }),
      "ja-JP"
    );

    expect(parsed.title).toBe("名称未設定の明細");
  });

  it("normalizeResult returns invalid when a ledger_entry has a non-positive amount", () => {
    const withZeroEntry = parserOutputSchema.parse({
      ...simpleSuccess,
      ledger_entries: [{ ...simpleSuccess.ledger_entries[0]!, amount: "0" }],
    });
    const result = normalizeResult(withZeroEntry);
    expect(result.outcome).toBe("invalid");
  });

  it("normalizes a negative ledger entry and receipt total used as debit-display notation", () => {
    const withNegativeEntry = parserOutputSchema.parse({
      ...simpleSuccess,
      receipt_totals: [{ receipt_index: 0, amount: "-5", currency: "USD" }],
      ledger_entries: [{ ...simpleSuccess.ledger_entries[0]!, amount: "-5" }],
    });
    const result = normalizeResult(withNegativeEntry);
    expect(result.outcome).toBe("success");
    expect(result.receipt_totals[0]?.amount).toBe("5");
    expect(result.ledger_entries[0]?.amount).toBe("5");
  });

  it("rejects unquoted numeric amounts (schema-invalid outcome)", () => {
    const unquoted = {
      ...simpleSuccess,
      ledger_entries: [
        {
          receipt_index: 0,
          item_name: "Coffee",
          amount: 12.5, // unquoted JSON number
          currency: "USD",
          category_index: 1,
          notes: null,
        },
      ],
    };
    const result = parserOutputSchema.safeParse(unquoted);
    expect(result.success).toBe(false);
  });

  it("rejects exponent notation in amount strings", () => {
    const exponentEntry = {
      ...simpleSuccess,
      ledger_entries: [
        {
          ...simpleSuccess.ledger_entries[0]!,
          amount: "1e2",
        },
      ],
    };
    const result = parserOutputSchema.safeParse(exponentEntry);
    expect(result.success).toBe(false);
  });

  it("exposes binary floating-point error: 0.1 + 0.2 does not round-trip correctly with number", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
    // Using decimal strings avoids this error
    const parsed = normalizeResult(
      parserOutputSchema.parse({
        ...simpleSuccess,
        receipt_totals: [{ receipt_index: 0, amount: "0.30", currency: "USD" }],
        ledger_entries: [
          { ...simpleSuccess.ledger_entries[0]!, amount: "0.10", item_name: "Item A" },
          { ...simpleSuccess.ledger_entries[0]!, amount: "0.20", item_name: "Item B" },
        ],
      })
    );
    expect(parsed.ledger_entries).toHaveLength(2);
    // 0.10 + 0.20 should exactly equal 0.30 as strings
    expect(
      Number.parseFloat(parsed.ledger_entries[0]!.amount) +
        Number.parseFloat(parsed.ledger_entries[1]!.amount)
    ).not.toBe(0.3); // BINARY ERROR: proves we need strings
  });
});
