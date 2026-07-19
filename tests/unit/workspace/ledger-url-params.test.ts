import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildLedgerUrl,
  parseStatusesParam,
  formatStatusesParam,
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "@/modules/workspace/ledger-url-params";
import {
  replaceAndNavigateLedgerUrl,
  replaceLedgerUrl,
} from "@/modules/workspace/ledger-url-navigation";

describe("ledger-url-params", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves unrelated params while updating tab only", () => {
    const params = updateLedgerSearchParams(new URLSearchParams("period=month&categoryId=cat_1"), {
      tab: "details",
    });

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

  it("treats __uncategorized__ as a real category filter while clearing empty params", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("categoryId=old&currency=USD&minAmount=5&maxAmount=10"),
      {
        categoryId: "__uncategorized__",
        currency: "",
        minAmount: null,
        maxAmount: Number.NaN,
      }
    );

    expect(params.get("categoryId")).toBe("__uncategorized__");
    expect(params.get("currency")).toBeNull();
    expect(params.get("minAmount")).toBeNull();
    expect(params.get("maxAmount")).toBeNull();
  });

  it("preserves __uncategorized__ when writing category filters", () => {
    const params = updateLedgerSearchParams(new URLSearchParams("categoryId=old"), {
      categoryId: "__uncategorized__",
    });

    expect(params.toString()).toContain("categoryId=__uncategorized__");
  });

  it("reads __uncategorized__ back from the URL", () => {
    const filters = readLedgerFilterParams(
      new URLSearchParams("categoryId=__uncategorized__&currency=USD")
    );

    expect(filters.categoryId).toBe("__uncategorized__");
    expect(filters.statuses).toEqual([]);
  });

  it("doesn't drop uncategorized when unrelated params change", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("categoryId=__uncategorized__"),
      { currency: "EUR" }
    );

    expect(params.toString()).toContain("categoryId=__uncategorized__");
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
      statuses: [],
    });
  });

  it("writes and overwrites numeric filter params", () => {
    const params = updateLedgerSearchParams(new URLSearchParams("minAmount=5"), {
      minAmount: 100,
      maxAmount: 250,
    });

    expect(params.get("minAmount")).toBe("100");
    expect(params.get("maxAmount")).toBe("250");
  });

  it("drops retired search params while preserving unrelated params", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("search=coffee&period=thisMonth&foo=bar"),
      { tab: "details" }
    );

    expect(params.get("search")).toBeNull();
    expect(params.get("period")).toBe("thisMonth");
    expect(params.get("foo")).toBe("bar");
    expect(params.get("tab")).toBe("details");
  });

  it("builds URLs without introducing navigation side effects", () => {
    const params = new URLSearchParams("tab=details&period=custom");

    expect(buildLedgerUrl("/ledger/test-id", params)).toBe(
      "/ledger/test-id?tab=details&period=custom"
    );
  });

  it("replaces browser URL and optionally navigates through router", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const router = { replace: vi.fn() };
    const params = new URLSearchParams("tab=details&period=custom");

    const replacedUrl = replaceLedgerUrl("/ledger/test-id", params);
    const navigatedUrl = replaceAndNavigateLedgerUrl("/ledger/test-id", params, router);

    expect(replacedUrl).toBe("/ledger/test-id?tab=details&period=custom");
    expect(navigatedUrl).toBe("/ledger/test-id?tab=details&period=custom");
    expect(replaceState).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/ledger/test-id?tab=details&period=custom", {
      scroll: false,
    });
  });

  describe("parseStatusesParam", () => {
    it("returns empty array for null", () => {
      expect(parseStatusesParam(null)).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(parseStatusesParam("")).toEqual([]);
    });

    it("parses a single valid status", () => {
      expect(parseStatusesParam("completed")).toEqual(["completed"]);
    });

    it("parses multiple comma-delimited statuses in canonical order", () => {
      // Input order: failed,queued — canonical order: queued,failed
      expect(parseStatusesParam("failed,queued")).toEqual(["queued", "failed"]);
    });

    it("deduplicates repeated statuses", () => {
      expect(parseStatusesParam("queued,queued,processing")).toEqual(["queued", "processing"]);
    });

    it("ignores unknown status tokens", () => {
      expect(parseStatusesParam("queued,unknown_status,failed")).toEqual(["queued", "failed"]);
    });

    it("returns empty array when all tokens are invalid", () => {
      expect(parseStatusesParam("invalid,bogus")).toEqual([]);
    });

    it("handles whitespace around tokens", () => {
      expect(parseStatusesParam(" queued , processing ")).toEqual(["queued", "processing"]);
    });

    it("handles trailing and leading delimiters", () => {
      expect(parseStatusesParam(",queued,")).toEqual(["queued"]);
    });

    it("handles empty tokens between delimiters", () => {
      expect(parseStatusesParam("queued,,processing")).toEqual(["queued", "processing"]);
    });
  });

  describe("formatStatusesParam", () => {
    it("returns null for empty array", () => {
      expect(formatStatusesParam([])).toBeNull();
    });

    it("formats a single status", () => {
      expect(formatStatusesParam(["completed"])).toBe("completed");
    });

    it("formats multiple statuses in canonical order", () => {
      expect(formatStatusesParam(["failed", "queued", "processing"])).toBe(
        "queued,processing,failed"
      );
    });

    it("deduplicates values", () => {
      expect(formatStatusesParam(["queued", "queued", "processing"])).toBe("queued,processing");
    });
  });

  describe("statuses in updateLedgerSearchParams", () => {
    it("sets statuses parameter when provided", () => {
      const params = updateLedgerSearchParams(new URLSearchParams(""), {
        statuses: ["failed", "anomaly"],
      });

      expect(params.get("statuses")).toBe("anomaly,failed");
    });

    it("deletes statuses parameter when set to null", () => {
      const params = updateLedgerSearchParams(
        new URLSearchParams("statuses=queued,processing"),
        { statuses: null }
      );

      expect(params.get("statuses")).toBeNull();
    });

    it("deletes statuses parameter when set to empty array", () => {
      const params = updateLedgerSearchParams(
        new URLSearchParams("statuses=queued,processing"),
        { statuses: [] }
      );

      expect(params.get("statuses")).toBeNull();
    });

    it("preserves existing statuses when not in updates", () => {
      const params = updateLedgerSearchParams(
        new URLSearchParams("statuses=queued,processing"),
        { period: "all" }
      );

      expect(params.get("statuses")).toBe("queued,processing");
    });

    it("sets statuses together with other params in one update", () => {
      const params = updateLedgerSearchParams(
        new URLSearchParams("period=thisMonth&minAmount=10"),
        {
          period: "all",
          minAmount: null,
          maxAmount: null,
          statuses: ["candidate_pending", "anomaly", "failed"],
          tab: "stream",
        }
      );

      expect(params.get("period")).toBe("all");
      expect(params.get("startDate")).toBeNull();
      expect(params.get("endDate")).toBeNull();
      expect(params.get("minAmount")).toBeNull();
      expect(params.get("maxAmount")).toBeNull();
      expect(params.get("statuses")).toBe("anomaly,failed,candidate_pending");
      expect(params.get("tab")).toBe("stream");
    });
  });

  describe("statuses in readLedgerFilterParams", () => {
    it("reads statuses from URL", () => {
      const filters = readLedgerFilterParams(
        new URLSearchParams("statuses=queued,failed")
      );

      expect(filters.statuses).toEqual(["queued", "failed"]);
    });

    it("returns empty array when statuses param is absent", () => {
      const filters = readLedgerFilterParams(
        new URLSearchParams("categoryId=cat_1")
      );

      expect(filters.statuses).toEqual([]);
    });
  });
});
