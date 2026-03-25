import { describe, expect, it } from "vitest";
import {
  buildLedgerEntryCursorCondition,
  buildLedgerEntryFilterConditions,
} from "@/modules/ledger/application/queries/build-ledger-entry-filters";
import type { LedgerEntryFilterParams } from "@/modules/ledger/application/queries/build-ledger-entry-filters";

describe("buildLedgerEntryCursorCondition", () => {
  it("returns null for cursors with an invalid createdAt value", () => {
    expect(buildLedgerEntryCursorCondition("not-a-date|entry-1")).toBeNull();
  });
});

describe("buildLedgerEntryFilterConditions", () => {
  it("treats undefined date filters the same as omitted date filters", () => {
    const omitted = buildLedgerEntryFilterConditions("ledger-1", {});
    const explicitUndefinedFilters = {
      startDate: undefined,
      endDate: undefined,
    } as unknown as LedgerEntryFilterParams;
    const explicitUndefined = buildLedgerEntryFilterConditions("ledger-1", explicitUndefinedFilters);

    expect(explicitUndefined).toHaveLength(omitted.length);
  });
});
