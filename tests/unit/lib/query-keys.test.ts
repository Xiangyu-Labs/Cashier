import { describe, it, expect } from "vitest";
import {
  invalidateCalendar,
  invalidateLedger,
  invalidateLedgerEntries,
  invalidateLedgerSettings,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateTaskQueue,
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

    it("应该生成正确的defaultLedgerId query key", () => {
      expect(queryKeys.defaultLedgerId()).toEqual(["defaultLedgerId"]);
    });
  });

  describe("ledgerEntries keys", () => {
    it("应该生成正确的ledgerEntries query key", () => {
      expect(queryKeys.ledgerEntries(ledgerId)).toEqual(["ledgerEntries", ledgerId]);
    });

    it("应该生成带过滤器的ledgerEntries query key", () => {
      expect(queryKeys.ledgerEntries(ledgerId, "pending", "2024-01-01")).toEqual([
        "ledgerEntries",
        ledgerId,
        "pending",
        "2024-01-01",
      ]);
    });

    it("应该过滤掉undefined的过滤器参数", () => {
      expect(queryKeys.ledgerEntries(ledgerId, "pending", undefined, "value")).toEqual([
        "ledgerEntries",
        ledgerId,
        "pending",
        "value",
      ]);
    });

    it("应该保留null的过滤器参数（实际代码只过滤undefined）", () => {
      // 注意：实际代码只过滤undefined，null会被保留
      expect(queryKeys.ledgerEntries(ledgerId, null, "value")).toEqual([
        "ledgerEntries",
        ledgerId,
        null,
        "value",
      ]);
    });

    it("应该生成正确的ledgerEntry query key", () => {
      expect(queryKeys.ledgerEntry("entry-456")).toEqual(["ledgerEntry", "entry-456"]);
    });
  });

  describe("sourceDocuments keys", () => {
    it("应该生成正确的sourceDocuments query key", () => {
      expect(queryKeys.sourceDocuments(ledgerId)).toEqual(["sourceDocuments", ledgerId]);
    });

    it("应该生成带多种过滤器的sourceDocuments query key", () => {
      expect(queryKeys.sourceDocuments(ledgerId, "unified", 1, "2024-01-01")).toEqual([
        "sourceDocuments",
        ledgerId,
        "unified",
        1,
        "2024-01-01",
      ]);
    });

    it("应该生成正确的sourceDocument query key", () => {
      expect(queryKeys.sourceDocument("doc-789")).toEqual(["sourceDocument", "doc-789"]);
    });

    it("应该生成正确的sourceDocumentLight query key", () => {
      expect(queryKeys.sourceDocumentLight("doc-789")).toEqual([
        "sourceDocument",
        "light",
        "doc-789",
      ]);
    });
  });

  describe("categories keys", () => {
    it("应该生成正确的categories query keys", () => {
      expect(queryKeys.entryCategories(ledgerId)).toEqual(["entryCategories", ledgerId]);
      expect(queryKeys.uncategorizedCount(ledgerId)).toEqual(["uncategorizedCount", ledgerId]);
      expect(queryKeys.ledgerSettings(ledgerId)).toEqual(["ledgerSettings", ledgerId]);
    });
  });

  describe("stats keys", () => {
    it("应该生成正确的summary query key", () => {
      expect(queryKeys.summary(ledgerId)).toEqual(["summary", ledgerId]);
    });

    it("应该生成带参数的summary query key", () => {
      expect(queryKeys.summary(ledgerId, "2024-01-01", "2024-12-31")).toEqual([
        "summary",
        ledgerId,
        "2024-01-01",
        "2024-12-31",
      ]);
    });

    it("应该过滤summary中的undefined参数", () => {
      expect(queryKeys.summary(ledgerId, "2024-01-01", undefined)).toEqual([
        "summary",
        ledgerId,
        "2024-01-01",
      ]);
    });

    it("应该生成正确的tokenStats query key", () => {
      expect(queryKeys.tokenStats(ledgerId)).toEqual(["token-stats", ledgerId]);
    });

    it("应该生成正确的enhancedStats query key", () => {
      expect(queryKeys.enhancedStats(ledgerId)).toEqual(["enhanced-stats", ledgerId]);
    });
  });

  describe("currency keys", () => {
    it("应该生成正确的convert query key", () => {
      expect(queryKeys.convert(100, "USD", "CNY")).toEqual([
        "convert",
        100,
        "USD",
        "CNY",
        undefined,
      ]);
    });

    it("应该生成带日期的convert query key", () => {
      expect(queryKeys.convert(100, "USD", "CNY", "2024-01-01")).toEqual([
        "convert",
        100,
        "USD",
        "CNY",
        "2024-01-01",
      ]);
    });

    it("应该生成正确的batchConvert query key", () => {
      expect(queryKeys.batchConvert("cache-1", "CNY")).toEqual(["batchConvert", "cache-1", "CNY"]);
    });
  });

  describe("task keys", () => {
    it("应该生成正确的task query keys", () => {
      expect(queryKeys.processingTasks(ledgerId)).toEqual(["processingTasks", ledgerId]);
      expect(queryKeys.taskQueue(ledgerId)).toEqual(["taskQueue", ledgerId]);
    });
  });

  describe("serviceCredentials keys", () => {
    it("应该生成正确的serviceCredentials query key", () => {
      expect(queryKeys.serviceCredentials(ledgerId)).toEqual(["serviceCredentials", ledgerId]);
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
      invalidateSourceDocuments(ledgerId)({ queryKey: queryKeys.sourceDocuments(ledgerId, "all") })
    ).toBe(true);
    expect(invalidateSourceDocuments(ledgerId)({ queryKey: queryKeys.taskQueue(ledgerId) })).toBe(
      false
    );
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
    expect(invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.entryCategories(ledgerId) })).toBe(
      true
    );
    expect(invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.ledgerSettings(ledgerId) })).toBe(
      true
    );
    expect(invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.serviceCredentials(ledgerId) })).toBe(
      true
    );
    expect(invalidateLedgerSettings(ledgerId)({ queryKey: queryKeys.summary(ledgerId) })).toBe(
      false
    );
  });

  it("matches task queue queries only", () => {
    expect(invalidateTaskQueue(ledgerId)({ queryKey: queryKeys.taskQueue(ledgerId) })).toBe(true);
    expect(invalidateTaskQueue(ledgerId)({ queryKey: queryKeys.processingTasks(ledgerId) })).toBe(
      true
    );
    expect(invalidateTaskQueue(ledgerId)({ queryKey: queryKeys.sourceDocuments(ledgerId) })).toBe(
      false
    );
  });

  it("matches calendar queries only", () => {
    expect(
      invalidateCalendar(ledgerId)({ queryKey: queryKeys.calendarHeatmap(ledgerId, "month", "2024-01-01") })
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
