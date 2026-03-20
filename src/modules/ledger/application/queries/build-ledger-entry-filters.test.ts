import { describe, expect, it } from "vitest";
import { buildLedgerEntryCursorCondition } from "./build-ledger-entry-filters";

describe("buildLedgerEntryCursorCondition", () => {
  it("returns null for cursors with an invalid createdAt value", () => {
    expect(buildLedgerEntryCursorCondition("not-a-date|entry-1")).toBeNull();
  });
});
