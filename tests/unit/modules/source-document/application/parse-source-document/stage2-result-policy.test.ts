import { describe, expect, it } from "vitest";
import {
  buildStage2SuccessOutput,
  compareParsedEntries,
} from "@/modules/source-document/application/parse-source-document/stage2-result-policy";

describe("stage2-result-policy", () => {
  it("treats reordered entries with matching grouped totals as equal", () => {
    expect(
      compareParsedEntries(
        [
          { item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null },
          { item_name: "Tip", amount: 2, currency: "USD", category_index: 1, notes: null },
        ],
        [
          { item_name: "Tip", amount: 2, currency: "USD", category_index: 1, notes: null },
          { item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null },
        ]
      )
    ).toBe(true);
  });

  it("falls back to Untitled when validation summary has no title", () => {
    expect(
      buildStage2SuccessOutput(
        [{ item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null }],
        "Parsed",
        undefined,
        false
      ).title
    ).toBe("Untitled");
  });
});
