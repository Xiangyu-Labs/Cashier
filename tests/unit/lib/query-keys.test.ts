import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query-keys";

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
      expect(queryKeys.ledgerEntries(ledgerId)).toEqual(["ledger", ledgerId, "entries", {}]);
    });

    it("应该生成带结构化过滤器的ledgerEntries query key", () => {
      expect(
        queryKeys.ledgerEntries(ledgerId, { status: "pending", startDate: "2024-01-01" })
      ).toEqual(["ledger", ledgerId, "entries", { status: "pending", startDate: "2024-01-01" }]);
    });

    it("应该保留结构化过滤器中的字段位置", () => {
      expect(
        queryKeys.ledgerEntries(ledgerId, {
          status: "pending",
          startDate: undefined,
          search: "value",
        })
      ).toEqual([
        "ledger",
        ledgerId,
        "entries",
        { status: "pending", startDate: null, search: "value" },
      ]);
    });

    it("应该生成没有过滤器的空参数对象", () => {
      expect(queryKeys.ledgerEntries(ledgerId)).toEqual(["ledger", ledgerId, "entries", {}]);
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
      expect(queryKeys.sourceDocuments(ledgerId)).toEqual([
        "ledger",
        ledgerId,
        "source-documents",
        {},
      ]);
    });

    it("应该生成带多种过滤器的sourceDocuments query key", () => {
      expect(
        queryKeys.sourceDocuments(ledgerId, {
          view: "unified",
          page: 1,
          startDate: "2024-01-01",
        })
      ).toEqual([
        "ledger",
        ledgerId,
        "source-documents",
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
        "ledger",
        ledgerId,
        "source-documents",
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
        "ledger",
        ledgerId,
        "source-documents",
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
        "ledger",
        ledgerId,
        "source-documents",
        "stream-total",
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
      expect(queryKeys.entryCategories(ledgerId)).toEqual(["ledger", ledgerId, "categories"]);
      expect(queryKeys.ledgerSettings(ledgerId)).toEqual(["ledger", ledgerId, "settings"]);
    });
  });

  describe("stats keys", () => {
    it("应该生成正确的summary query key", () => {
      expect(queryKeys.summary(ledgerId)).toEqual(["ledger", ledgerId, "summary", {}]);
    });

    it("应该生成带参数的summary query key", () => {
      expect(
        queryKeys.summary(ledgerId, { startDate: "2024-01-01", endDate: "2024-12-31" })
      ).toEqual([
        "ledger",
        ledgerId,
        "summary",
        { startDate: "2024-01-01", endDate: "2024-12-31" },
      ]);
    });

    it("应该把summary中的undefined参数固定为null", () => {
      expect(queryKeys.summary(ledgerId, { startDate: "2024-01-01", endDate: undefined })).toEqual([
        "ledger",
        ledgerId,
        "summary",
        { startDate: "2024-01-01", endDate: null },
      ]);
    });

    it("应该生成正确的tokenStats query key", () => {
      expect(queryKeys.tokenStats(ledgerId)).toEqual(["ledger", ledgerId, "token-stats"]);
    });

    it("应该生成正确的enhancedStats query key", () => {
      expect(queryKeys.enhancedStats(ledgerId)).toEqual(["ledger", ledgerId, "enhanced-stats", {}]);
    });
  });

  describe("currency keys", () => {
    it("应该生成正确的convert query key", () => {
      expect(queryKeys.convert("ledger-1", "100", "USD", "CNY", "2026-08-06")).toEqual([
        "ledger",
        "ledger-1",
        "convert",
        "100",
        "USD",
        "CNY",
        "2026-08-06",
      ]);
    });

    it("应该生成带日期的convert query key", () => {
      expect(queryKeys.convert("ledger-1", "100", "USD", "CNY", "2024-01-01")).toEqual([
        "ledger",
        "ledger-1",
        "convert",
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
        "ledger",
        ledgerId,
        "calendar",
        "heatmap",
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
        "ledger",
        ledgerId,
        "calendar",
        "heatmap",
        "year",
        "2024-01-01",
        { currency: "CNY", categoryId: "cat-1" },
      ]);
    });

    it("应该生成正确的calendarHeatmapForRange query key", () => {
      expect(queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31")).toEqual([
        "ledger",
        ledgerId,
        "calendar",
        "heatmap-range",
        "2024-01-01",
        "2024-12-31",
        undefined,
      ]);
    });

    it("应该生成带过滤器的calendarHeatmapForRange query key", () => {
      expect(
        queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31", { currency: "USD" })
      ).toEqual([
        "ledger",
        ledgerId,
        "calendar",
        "heatmap-range",
        "2024-01-01",
        "2024-12-31",
        { currency: "USD" },
      ]);
    });

    it("应该生成正确的calendarDayDetail query key", () => {
      expect(queryKeys.calendarDayDetail(ledgerId, "2024-03-15")).toEqual([
        "ledger",
        ledgerId,
        "calendar",
        "day",
        "2024-03-15",
        undefined,
      ]);
    });

    it("应该生成带过滤器的calendarDayDetail query key", () => {
      expect(queryKeys.calendarDayDetail(ledgerId, "2024-03-15", { categoryId: "cat-1" })).toEqual([
        "ledger",
        ledgerId,
        "calendar",
        "day",
        "2024-03-15",
        { categoryId: "cat-1" },
      ]);
    });
  });
});
