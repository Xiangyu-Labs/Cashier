import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildLedgerUrl,
  parseStatusesParam,
  formatStatusesParam,
  readLedgerFilterParams,
  updateLedgerSearchParams,
} from "@/modules/workspace/ledger-url-params";
import { replaceLedgerUrl } from "@/modules/workspace/ledger-url-navigation";

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
    const params = updateLedgerSearchParams(new URLSearchParams("categoryId=__uncategorized__"), {
      currency: "EUR",
    });

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
      search: null,
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

  it("preserves legacy search params until a scoped update migrates them", () => {
    const params = updateLedgerSearchParams(
      new URLSearchParams("search=coffee&period=thisMonth&foo=bar"),
      { tab: "details" }
    );

    expect(params.get("search")).toBe("coffee");
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

  it("replaces the browser URL synchronously", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const params = new URLSearchParams("tab=details&period=custom");

    const replacedUrl = replaceLedgerUrl("/ledger/test-id", params);

    expect(replacedUrl).toBe("/ledger/test-id?tab=details&period=custom");
    expect(replaceState).toHaveBeenCalled();
  });

  it("keeps Stream and Details filter namespaces isolated", () => {
    const initial = new URLSearchParams(
      "streamPeriod=week&streamCategoryId=stream-cat&detailsPeriod=year&detailsCategoryId=details-cat"
    );

    const next = updateLedgerSearchParams(initial, { currency: "EUR" }, "details");

    expect(next.get("streamPeriod")).toBe("week");
    expect(next.get("streamCategoryId")).toBe("stream-cat");
    expect(next.get("detailsPeriod")).toBe("year");
    expect(next.get("detailsCategoryId")).toBe("details-cat");
    expect(next.get("detailsCurrency")).toBe("EUR");
    expect(readLedgerFilterParams(next, "stream").currency).toBeNull();
    expect(readLedgerFilterParams(next, "details").currency).toBe("EUR");
  });

  it("stores independent streamSearch and detailsSearch parameters", () => {
    const stream = updateLedgerSearchParams(
      new URLSearchParams("detailsSearch=latte"),
      { search: "receipt" },
      "stream"
    );
    const details = updateLedgerSearchParams(stream, { search: "morning" }, "details");

    expect(details.get("streamSearch")).toBe("receipt");
    expect(details.get("detailsSearch")).toBe("morning");
    expect(readLedgerFilterParams(details, "stream").search).toBe("receipt");
    expect(readLedgerFilterParams(details, "details").search).toBe("morning");
  });

  it("reads legacy filters for the current scope and migrates them on update", () => {
    const legacy = new URLSearchParams(
      "period=custom&startDate=2026-07-01&endDate=2026-07-31&categoryId=cat-1&statuses=failed"
    );

    expect(readLedgerFilterParams(legacy, "stream").categoryId).toBe("cat-1");
    const migrated = updateLedgerSearchParams(legacy, { currency: "CNY" }, "stream");

    expect(migrated.get("period")).toBeNull();
    expect(migrated.get("categoryId")).toBeNull();
    expect(migrated.get("streamPeriod")).toBe("custom");
    expect(migrated.get("streamStartDate")).toBe("2026-07-01");
    expect(migrated.get("streamEndDate")).toBe("2026-07-31");
    expect(migrated.get("streamCategoryId")).toBe("cat-1");
    expect(migrated.get("streamStatuses")).toBe("failed");
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
      // Input order: failed,processing — canonical order: processing,failed
      expect(parseStatusesParam("failed,processing")).toEqual(["processing", "failed"]);
    });

    it("deduplicates repeated statuses", () => {
      expect(parseStatusesParam("processing,processing,processing")).toEqual(["processing"]);
    });

    it("ignores unknown status tokens", () => {
      expect(parseStatusesParam("processing,unknown_status,failed")).toEqual([
        "processing",
        "failed",
      ]);
    });

    it("returns empty array when all tokens are invalid", () => {
      expect(parseStatusesParam("invalid,bogus")).toEqual([]);
    });

    it("handles whitespace around tokens", () => {
      expect(parseStatusesParam(" processing , failed ")).toEqual(["processing", "failed"]);
    });

    it("handles trailing and leading delimiters", () => {
      expect(parseStatusesParam(",processing,")).toEqual(["processing"]);
    });

    it("handles empty tokens between delimiters", () => {
      expect(parseStatusesParam("processing,,failed")).toEqual(["processing", "failed"]);
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
      expect(formatStatusesParam(["failed", "processing"])).toBe("processing,failed");
    });

    it("deduplicates values", () => {
      expect(formatStatusesParam(["processing", "processing", "processing"])).toBe("processing");
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
      const params = updateLedgerSearchParams(new URLSearchParams("statuses=processing,failed"), {
        statuses: null,
      });

      expect(params.get("statuses")).toBeNull();
    });

    it("deletes statuses parameter when set to empty array", () => {
      const params = updateLedgerSearchParams(new URLSearchParams("statuses=processing,failed"), {
        statuses: [],
      });

      expect(params.get("statuses")).toBeNull();
    });

    it("preserves existing statuses when not in updates", () => {
      const params = updateLedgerSearchParams(new URLSearchParams("statuses=processing,failed"), {
        period: "all",
      });

      expect(params.get("statuses")).toBe("processing,failed");
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
      const filters = readLedgerFilterParams(new URLSearchParams("statuses=processing,failed"));

      expect(filters.statuses).toEqual(["processing", "failed"]);
    });

    it("returns empty array when statuses param is absent", () => {
      const filters = readLedgerFilterParams(new URLSearchParams("categoryId=cat_1"));

      expect(filters.statuses).toEqual([]);
    });
  });
});
