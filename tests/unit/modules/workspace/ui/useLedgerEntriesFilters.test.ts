import { describe, expect, it } from "vitest";
import { buildStreamTotalQuery } from "@/modules/workspace/ui/useLedgerEntriesFilters";

describe("buildStreamTotalQuery", () => {
  it("omits null amount filters from the strict server-action payload", () => {
    expect(
      buildStreamTotalQuery(
        { minAmount: null, maxAmount: null, statuses: [] },
        "2026-07-01",
        "2026-07-31"
      )
    ).toEqual({
      input: { startDate: "2026-07-01", endDate: "2026-07-31" },
      statusesKey: null,
    });
  });

  it("keeps numeric filters and canonicalizes status ordering", () => {
    expect(
      buildStreamTotalQuery(
        {
          minAmount: 10,
          maxAmount: 20,
          statuses: ["failed", "candidate_pending", "failed"],
        },
        undefined,
        undefined
      )
    ).toEqual({
      input: {
        minAmount: 10,
        maxAmount: 20,
        statuses: ["candidate_pending", "failed"],
      },
      statusesKey: "candidate_pending,failed",
    });
  });
});
