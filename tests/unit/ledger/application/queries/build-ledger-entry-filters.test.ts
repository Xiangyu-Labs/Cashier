import { describe, expect, it } from "vitest";
import {
  buildLedgerEntryCursorCondition,
  buildLedgerEntryFilterConditions,
} from "@/application/adapters/sqlite/ledger-reads/build-ledger-entry-filters";
import type { LedgerEntryFilterParams } from "@/application/adapters/sqlite/ledger-reads/build-ledger-entry-filters";

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

  it("adds supported category, currency, and amount filters without search", () => {
    const base = buildLedgerEntryFilterConditions("ledger-1", {});
    const filtered = buildLedgerEntryFilterConditions("ledger-1", {
      categoryId: "11111111-1111-4111-8111-111111111111",
      currency: "USD",
      minAmount: 10,
      maxAmount: 50,
    });

    expect(filtered.length).toBe(base.length + 4);
  });
});
