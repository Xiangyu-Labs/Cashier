import { describe, it, expect } from "vitest";
import {
  invalidateCalendar,
  invalidateEntryCategories,
  invalidateLedger,
  invalidateLedgerEntries,
  invalidateLedgerSettings,
  invalidateLedgerSettingsView,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateSourceDocumentStreamTotal,
  queryKeys,
} from "@/lib/query-keys";

describe("queryKeys", () => {
  const ledgerId = "test-ledger-123";

  describe("ledger keys", () => {
    it("应该生成正确的ledger query key", () => {
      expect(queryKeys.ledger(ledgerId)).toEqual(["ledger", ledgerId]);
    });

    it("应该生成正确的ledgers query key", () => {
      expect(queryKeys.ledgers()).toEqual(["ledgers"]);
    });
  });

  describe("ledgerEntries keys", () => {
    it("应该生成正确的ledgerEntries query key", () => {
      expect(queryKeys.ledgerEntries(ledgerId)).toEqual(["ledgerEntries", ledgerId, {}]);
    });

    it("应该生成带结构化过滤器的ledgerEntries query key", () => {
      expect(
        queryKeys.ledgerEntries(ledgerId, { status: "pending", startDate: "2024-01-01" })
      ).toEqual(["ledgerEntries", ledgerId, { status: "pending", startDate: "2024-01-01" }]);
    });

    it("应该保留结构化过滤器中的字段位置", () => {
      expect(
        queryKeys.ledgerEntries(ledgerId, {
          status: "pending",
          startDate: undefined,
          search: "value",
        })
      ).toEqual([
        "ledgerEntries",
        ledgerId,
        { status: "pending", startDate: null, search: "value" },
      ]);
    });

    it("应该生成没有过滤器的空参数对象", () => {
      expect(queryKeys.ledgerEntries(ledgerId)).toEqual(["ledgerEntries", ledgerId, {}]);
    });

    it("应该生成正确的ledgerEntry query key", () => {
      expect(queryKeys.ledgerEntry("ledger-1", "entry-456")).toEqual([
        "ledger",
        "ledger-1",
        "entry",
        "entry-456",
      ]);
    });

    it("生成不同ledger下的不同ledgerEntry key", () => {
      expect(queryKeys.ledgerEntry("ledger-1", "entry-456")).not.toEqual(
        queryKeys.ledgerEntry("ledger-2", "entry-456")
      );
    });
  });

  describe("sourceDocuments keys", () => {
    it("应该生成正确的sourceDocuments query key", () => {
      expect(queryKeys.sourceDocuments(ledgerId)).toEqual(["sourceDocuments", ledgerId, {}]);
    });

    it("应该生成带多种过滤器的sourceDocuments query key", () => {
      expect(
        queryKeys.sourceDocuments(ledgerId, {
          view: "unified",
          page: 1,
          startDate: "2024-01-01",
        })
      ).toEqual([
        "sourceDocuments",
        ledgerId,
        { view: "unified", page: 1, startDate: "2024-01-01" },
      ]);
    });

    it("应该生成正确的sourceDocument query key", () => {
      expect(queryKeys.sourceDocument("ledger-1", "doc-789")).toEqual([
        "ledger",
        "ledger-1",
        "source-document",
        "doc-789",
        "detail",
      ]);
    });

    it("应该生成正确的sourceDocumentLight query key", () => {
      expect(queryKeys.sourceDocumentLight("ledger-1", "doc-789")).toEqual([
        "ledger",
        "ledger-1",
        "source-document",
        "doc-789",
        "light",
      ]);
    });

    it("generates ledger-scoped source document review keys", () => {
      expect(queryKeys.sourceDocumentCandidateReview("ledger-1", "doc-789")).toEqual([
        "ledger",
        "ledger-1",
        "source-document",
        "doc-789",
        "review",
        "candidate",
      ]);
      expect(queryKeys.sourceDocumentDuplicateReview("ledger-1", "doc-789")).toEqual([
        "ledger",
        "ledger-1",
        "source-document",
        "doc-789",
        "review",
        "duplicate",
      ]);
      expect(queryKeys.sourceDocumentFull("ledger-1", "doc-789")).toEqual([
        "ledger",
        "ledger-1",
        "source-document",
        "doc-789",
        "full",
      ]);
    });

    it("生成不同ledger下的不同sourceDocument key", () => {
      expect(queryKeys.sourceDocument("ledger-1", "doc-789")).not.toEqual(
        queryKeys.sourceDocument("ledger-2", "doc-789")
      );
      expect(queryKeys.sourceDocumentLight("ledger-1", "doc-789")).not.toEqual(
        queryKeys.sourceDocumentLight("ledger-2", "doc-789")
      );
    });

    it("应该生成正确的sourceDocumentStream query key with filters", () => {
      expect(
        queryKeys.sourceDocumentStream(ledgerId, {
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          minAmount: "20",
          maxAmount: "100",
        })
      ).toEqual([
        "sourceDocuments",
        ledgerId,
        "stream",
        {
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          minAmount: "20",
          maxAmount: "100",
        },
      ]);
    });

    it("应该生成正确的sourceDocumentStreamPrefix query key", () => {
      expect(queryKeys.sourceDocumentStreamPrefix(ledgerId)).toEqual([
        "sourceDocuments",
        ledgerId,
        "stream",
      ]);
    });

    it("builds a filter-complete stream total query key", () => {
      expect(
        queryKeys.sourceDocumentStreamTotal(ledgerId, {
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          minAmount: "10",
          maxAmount: "100",
          statuses: "completed,failed",
        })
      ).toEqual([
        "sourceDocuments",
        ledgerId,
        "streamTotal",
        {
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          minAmount: "10",
          maxAmount: "100",
          statuses: "completed,failed",
        },
      ]);
    });
  });

  describe("categories keys", () => {
    it("应该生成正确的categories query keys", () => {
      expect(queryKeys.entryCategories(ledgerId)).toEqual(["entryCategories", ledgerId]);
      expect(queryKeys.ledgerSettings(ledgerId)).toEqual(["ledgerSettings", ledgerId]);
    });
  });

  describe("stats keys", () => {
    it("应该生成正确的summary query key", () => {
      expect(queryKeys.summary(ledgerId)).toEqual(["summary", ledgerId, {}]);
    });

    it("应该生成带参数的summary query key", () => {
      expect(
        queryKeys.summary(ledgerId, { startDate: "2024-01-01", endDate: "2024-12-31" })
      ).toEqual(["summary", ledgerId, { startDate: "2024-01-01", endDate: "2024-12-31" }]);
    });

    it("应该把summary中的undefined参数固定为null", () => {
      expect(queryKeys.summary(ledgerId, { startDate: "2024-01-01", endDate: undefined })).toEqual([
        "summary",
        ledgerId,
        { startDate: "2024-01-01", endDate: null },
      ]);
    });

    it("应该生成正确的tokenStats query key", () => {
      expect(queryKeys.tokenStats(ledgerId)).toEqual(["token-stats", ledgerId]);
    });

    it("应该生成正确的enhancedStats query key", () => {
      expect(queryKeys.enhancedStats(ledgerId)).toEqual(["enhanced-stats", ledgerId, {}]);
    });
  });

  describe("currency keys", () => {
    it("应该生成正确的convert query key", () => {
      expect(queryKeys.convert("ledger-1", "100", "USD", "CNY", "2026-08-06")).toEqual([
        "convert",
        "ledger-1",
        "100",
        "USD",
        "CNY",
        "2026-08-06",
      ]);
    });

    it("应该生成带日期的convert query key", () => {
      expect(queryKeys.convert("ledger-1", "100", "USD", "CNY", "2024-01-01")).toEqual([
        "convert",
        "ledger-1",
        "100",
        "USD",
        "CNY",
        "2024-01-01",
      ]);
    });

    it("应该生成正确的batchConvert query key", () => {
      expect(queryKeys.batchConvert("cache-1", "CNY")).toEqual(["batchConvert", "cache-1", "CNY"]);
    });
  });

  describe("calendar keys", () => {
    it("应该生成正确的calendarHeatmap query key", () => {
      expect(queryKeys.calendarHeatmap(ledgerId, "month", "2024-03-01")).toEqual([
        "calendar",
        "heatmap",
        ledgerId,
        "month",
        "2024-03-01",
        undefined,
      ]);
    });

    it("应该生成带过滤器的calendarHeatmap query key", () => {
      expect(
        queryKeys.calendarHeatmap(ledgerId, "year", "2024-01-01", {
          currency: "CNY",
          categoryId: "cat-1",
        })
      ).toEqual([
        "calendar",
        "heatmap",
        ledgerId,
        "year",
        "2024-01-01",
        { currency: "CNY", categoryId: "cat-1" },
      ]);
    });

    it("应该生成正确的calendarHeatmapForRange query key", () => {
      expect(queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31")).toEqual([
        "calendar",
        "heatmap-range",
        ledgerId,
        "2024-01-01",
        "2024-12-31",
        undefined,
      ]);
    });

    it("应该生成带过滤器的calendarHeatmapForRange query key", () => {
      expect(
        queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31", { currency: "USD" })
      ).toEqual([
        "calendar",
        "heatmap-range",
        ledgerId,
        "2024-01-01",
        "2024-12-31",
        { currency: "USD" },
      ]);
    });

    it("应该生成正确的calendarDayDetail query key", () => {
      expect(queryKeys.calendarDayDetail(ledgerId, "2024-03-15")).toEqual([
        "calendar",
        "day",
        ledgerId,
        "2024-03-15",
        undefined,
      ]);
    });

    it("应该生成带过滤器的calendarDayDetail query key", () => {
      expect(queryKeys.calendarDayDetail(ledgerId, "2024-03-15", { categoryId: "cat-1" })).toEqual([
        "calendar",
        "day",
        ledgerId,
        "2024-03-15",
        { categoryId: "cat-1" },
      ]);
    });
  });
});

describe("query invalidation helpers", () => {
  const ledgerId = "test-ledger-123";
  it("matches ledger resource keys narrowly", () => {
    expect(invalidateLedger(ledgerId)({ queryKey: queryKeys.ledger(ledgerId) })).toBe(true);
    expect(invalidateLedger(ledgerId)({ queryKey: queryKeys.ledgers() })).toBe(false);
  });

  it("matches ledger entries queries only", () => {
    expect(invalidateLedgerEntries(ledgerId)({ queryKey: queryKeys.ledgerEntries(ledgerId) })).toBe(
      true
    );
    expect(invalidateLedgerEntries(ledgerId)({ queryKey: queryKeys.summary(ledgerId) })).toBe(
      false
    );
  });

  it("matches source document queries only", () => {
    expect(
      invalidateSourceDocuments(ledgerId)({
        queryKey: queryKeys.sourceDocumentStream(ledgerId),
      })
    ).toBe(true);
    expect(invalidateSourceDocuments(ledgerId)({ queryKey: queryKeys.summary(ledgerId) })).toBe(
      false
    );
  });

  it("matches only stream total queries for the selected ledger", () => {
    expect(
      invalidateSourceDocumentStreamTotal(ledgerId)({
        queryKey: queryKeys.sourceDocumentStreamTotal(ledgerId),
      })
    ).toBe(true);
    expect(
      invalidateSourceDocumentStreamTotal(ledgerId)({
        queryKey: queryKeys.sourceDocumentStream(ledgerId),
      })
    ).toBe(false);
  });

  it("matches summary and enhanced stats queries", () => {
    expect(invalidateLedgerStats(ledgerId)({ queryKey: queryKeys.summary(ledgerId) })).toBe(true);
    expect(invalidateLedgerStats(ledgerId)({ queryKey: queryKeys.enhancedStats(ledgerId) })).toBe(
      true
    );
    expect(invalidateLedgerStats(ledgerId)({ queryKey: queryKeys.ledgerEntries(ledgerId) })).toBe(
      false
    );
  });

  it("matches settings queries only", () => {
    expect(
      invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.entryCategories(ledgerId) })
    ).toBe(true);
    expect(
      invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.ledgerSettings(ledgerId) })
    ).toBe(true);
    expect(invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.summary(ledgerId) })).toBe(
      false
    );
  });

  it("targets category settings without matching credentials or sibling settings", () => {
    expect(
      invalidateEntryCategories(ledgerId)({ queryKey: queryKeys.entryCategories(ledgerId) })
    ).toBe(true);
    expect(
      invalidateLedgerSettingsView(ledgerId)({ queryKey: queryKeys.ledgerSettings(ledgerId) })
    ).toBe(true);
  });

  it("matches calendar queries only", () => {
    expect(
      invalidateCalendar(ledgerId)({
        queryKey: queryKeys.calendarHeatmap(ledgerId, "month", "2024-01-01"),
      })
    ).toBe(true);
    expect(
      invalidateCalendar(ledgerId)({
        queryKey: queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-01-31"),
      })
    ).toBe(true);
    expect(invalidateCalendar(ledgerId)({ queryKey: queryKeys.ledgerEntries(ledgerId) })).toBe(
      false
    );
  });
});
