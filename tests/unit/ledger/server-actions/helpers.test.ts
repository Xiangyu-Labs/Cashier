import { describe, expect, it } from "vitest";
import { buildCaseExpression } from "../../../../src/modules/ledger/server-actions/helpers";
import type { fetchEntriesForConversion } from "../../../../src/modules/ledger/server-actions/helpers";

describe("buildCaseExpression", () => {
  it("throws a clear error when a conversion result is missing for an entry", () => {
    expect(() =>
      buildCaseExpression(
        [
          {
            id: "entry-1",
          },
        ] as Awaited<ReturnType<typeof fetchEntriesForConversion>>,
        [],
        "convertedAmount"
      )
    ).toThrow("Missing conversion result for ledger entry entry-1 at index 0");
  });
});
