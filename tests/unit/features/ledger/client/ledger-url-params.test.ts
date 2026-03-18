import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildLedgerUrl,
  readLedgerFilterParams,
  replaceAndNavigateLedgerUrl,
  replaceLedgerUrl,
  updateLedgerSearchParams,
} from "@/features/ledger/client/ledger-url-params";

describe("ledger-url-params", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves unrelated params while updating tab only", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("period=month&categoryId=cat_1"),
      { tab: "details" }
    );

    expect(params.toString()).toContain("tab=details");
    expect(params.toString()).toContain("period=month");
    expect(params.toString()).toContain("categoryId=cat_1");
  });

  it("clears startDate and endDate when switching to non-custom period", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("period=custom&startDate=2024-01-01&endDate=2024-01-31"),
      { period: "week" }
    );

    expect(params.get("period")).toBe("week");
    expect(params.get("startDate")).toBeNull();
    expect(params.get("endDate")).toBeNull();
  });

  it("removes uncategorized and empty filter params from URL", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("categoryId=old&currency=USD&minAmount=5&maxAmount=10"),
      {
        categoryId: "__uncategorized__",
        currency: "",
        minAmount: null,
        maxAmount: Number.NaN,
      }
    );

    expect(params.get("categoryId")).toBeNull();
    expect(params.get("currency")).toBeNull();
    expect(params.get("minAmount")).toBeNull();
    expect(params.get("maxAmount")).toBeNull();
  });

  it("reads normalized filter params from URLSearchParams", () => {
    const filters = readLedgerFilterParams(
      new URLSearchParams("categoryId=cat_2&currency=EUR&minAmount=100&maxAmount=250")
    );

    expect(filters).toEqual({
      categoryId: "cat_2",
      currency: "EUR",
      minAmount: 100,
      maxAmount: 250,
    });
  });

  it("replaces browser URL and optionally navigates through router", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const router = { replace: vi.fn() };
    const params = new URLSearchParams("tab=details&period=custom");

    const replacedUrl = replaceLedgerUrl("/ledger/test-id", params);
    const navigatedUrl = replaceAndNavigateLedgerUrl("/ledger/test-id", params, router);

    expect(buildLedgerUrl("/ledger/test-id", params)).toBe("/ledger/test-id?tab=details&period=custom");
    expect(replacedUrl).toBe("/ledger/test-id?tab=details&period=custom");
    expect(navigatedUrl).toBe("/ledger/test-id?tab=details&period=custom");
    expect(replaceState).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/ledger/test-id?tab=details&period=custom", { scroll: false });
  });
});
