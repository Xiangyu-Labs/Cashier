import { describe, it, expect } from "vitest";
import { shouldPersistQuery } from "@/components/providers";

describe("shouldPersistQuery", () => {
  it("should not persist high-churn ledger entry and enhanced stats queries", () => {
    expect(shouldPersistQuery({ queryKey: ["ledgerEntries", "ledger-1"] })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ["enhanced-stats", "ledger-1"] })).toBe(false);
  });

  it("should continue persisting stable queries", () => {
    expect(shouldPersistQuery({ queryKey: ["ledger", "ledger-1"] })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["sourceDocuments", "ledger-1", "all"] })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["summary", "ledger-1"] })).toBe(true);
  });
});
