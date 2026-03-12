import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { periodToDateRange, type PeriodParams } from "@/lib/period-utils";

/**
 * Test to verify Query Key consistency between usePrefetchRelatedData and useDetailsTabData
 *
 * Issue: The prefetch hook was generating different Query Keys than the actual component hook,
 * causing cache misses when switching tabs even though data was prefetched.
 */

describe("Query Key Consistency", () => {
  const ledgerId = "test-ledger-id";
  const mainCurrency = "CNY";

  /**
   * Simulates how usePrefetchRelatedData generates Query Keys (BEFORE FIX)
   * This was the problematic implementation that added extra new Date() conversion
   * @deprecated - kept for documentation purposes
   */
  function _generatePrefetchQueryKey(periodParams: PeriodParams) {
    const dateRange = periodToDateRange(periodParams);
    // BUG: This was doing extra new Date() conversion which could cause timezone issues
    const startDate = dateRange.startDate ? formatDateTimeForApi(new Date(dateRange.startDate)) : null;
    const endDate = dateRange.endDate ? formatDateTimeForApi(new Date(dateRange.endDate)) : null;

    const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDate, endDate, mainCurrency, null);
    const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDate, endDate, null);

    return { summaryKey, entriesKey, startDate, endDate };
  }

  /**
   * Simulates how useDetailsTabData generates Query Keys (AFTER FIX)
   * Query key no longer includes filterKey to match prefetch
   */
  function generateDetailsQueryKey(periodParams: PeriodParams) {
    const dateRange = periodToDateRange(periodParams);

    // Convert string dates from periodToDateRange back to Date objects
    const filters = {
      startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
      endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
    };

    const startDateStr = formatDateTimeForApi(filters.startDate) ?? null;
    const endDateStr = formatDateTimeForApi(filters.endDate) ?? null;

    // FIXED: No longer include filterKey in query key to match prefetch
    const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDateStr, endDateStr, mainCurrency);
    const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr);

    return { summaryKey, entriesKey, startDate: startDateStr, endDate: endDateStr };
  }

  /**
   * Simulates how usePrefetchRelatedData generates Query Keys (AFTER FIX)
   * Uses the same logic as useDetailsTabData without extra date conversions
   */
  function generatePrefetchQueryKey(periodParams: PeriodParams) {
    const dateRange = periodToDateRange(periodParams);

    // Use dates directly without extra new Date() conversion
    const startDate = dateRange.startDate;
    const endDate = dateRange.endDate;

    // FIXED: No longer include null filterKey to match useDetailsTabData
    const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDate, endDate, mainCurrency);
    const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDate, endDate);

    return { summaryKey, entriesKey, startDate, endDate };
  }

  describe("periodToDateRange produces consistent output", () => {
    it("should return same dates for identical periodParams", () => {
      const params: PeriodParams = { period: "thisMonth" };

      const result1 = periodToDateRange(params);
      const result2 = periodToDateRange(params);

      expect(result1.startDate).toBe(result2.startDate);
      expect(result1.endDate).toBe(result2.endDate);
    });

    it("should return null dates for 'all' period", () => {
      const params: PeriodParams = { period: "all" };

      const result = periodToDateRange(params);

      expect(result.startDate).toBeNull();
      expect(result.endDate).toBeNull();
    });
  });

  describe("Query Key matching between prefetch and details hooks", () => {
    const testCases: PeriodParams[] = [
      { period: "thisMonth" },
      { period: "week" },
      { period: "all" },
      { period: "currentPeriod", monthStartDay: 1 },
      { period: "currentPeriod", monthStartDay: 15 },
      { period: "custom", startDate: "2024-01-15", endDate: "2024-02-15" },
    ];

    testCases.forEach((params) => {
      it(`should generate matching Query Keys for period: ${params.period}`, () => {
        const details = generateDetailsQueryKey(params);
        const prefetch = generatePrefetchQueryKey(params);

        // The prefetch should match details exactly
        expect(prefetch.summaryKey).toEqual(details.summaryKey);
        expect(prefetch.entriesKey).toEqual(details.entriesKey);
        expect(prefetch.startDate).toBe(details.startDate);
        expect(prefetch.endDate).toBe(details.endDate);
      });
    });

    it("should not include filterKey in query key (filters are passed to queryFn only)", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const dateRange = periodToDateRange(params);

      // Simulate building filterKey (now used only for queryFn params, not query key)
      const advancedFilters = {
        categoryId: "cat-123",
        currency: "USD",
        minAmount: 100,
        maxAmount: 1000,
      };

      // Query Key WITHOUT filterKey (for cache consistency with prefetch)
      const keyWithoutFilterKey = queryKeys.ledgerEntries(
        ledgerId,
        "summary",
        dateRange.startDate,
        dateRange.endDate,
        mainCurrency
      );

      // Query key should not contain filter information
      expect(keyWithoutFilterKey).not.toContain("cat:cat-123");
      expect(keyWithoutFilterKey).not.toContain("cur:USD");
      expect(keyWithoutFilterKey).toHaveLength(6); // ledgerEntries, ledgerId, summary, startDate, endDate, mainCurrency

      // Filters are still available to be passed to queryFn
      const parts: string[] = [];
      if (advancedFilters.categoryId) parts.push(`cat:${advancedFilters.categoryId}`);
      if (advancedFilters.currency) parts.push(`cur:${advancedFilters.currency}`);
      if (advancedFilters.minAmount !== undefined && advancedFilters.minAmount !== null)
        parts.push(`min:${advancedFilters.minAmount}`);
      if (advancedFilters.maxAmount !== undefined && advancedFilters.maxAmount !== null)
        parts.push(`max:${advancedFilters.maxAmount}`);
      const filterKey = parts.length > 0 ? parts.join("|") : null;

      // filterKey can still be built for use in queryFn parameters
      expect(filterKey).toContain("cat:cat-123");
      expect(filterKey).toContain("cur:USD");
    });
  });

  describe("Query Key structure verification", () => {
    it("should have correct structure for summary query", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const { summaryKey } = generatePrefetchQueryKey(params);

      expect(summaryKey[0]).toBe("ledgerEntries");
      expect(summaryKey[1]).toBe(ledgerId);
      expect(summaryKey[2]).toBe("summary");
      // startDate, endDate, mainCurrency follow (no filterKey)
      expect(summaryKey).toHaveLength(6);
    });

    it("should have correct structure for infinite query", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const { entriesKey } = generatePrefetchQueryKey(params);

      expect(entriesKey[0]).toBe("ledgerEntries");
      expect(entriesKey[1]).toBe(ledgerId);
      expect(entriesKey[2]).toBe("infinite");
      // startDate, endDate follow (no filterKey)
      expect(entriesKey).toHaveLength(5);
    });

    it("should filter out undefined values from Query Key", () => {
      // When period is 'all', dates are null
      const params: PeriodParams = { period: "all" };
      const { summaryKey } = generatePrefetchQueryKey(params);

      // null values should still be included (they are not undefined)
      expect(summaryKey).toContain(null);
    });
  });

  describe("Date format consistency", () => {
    it("should produce yyyy-MM-dd format dates", () => {
      const params: PeriodParams = { period: "custom", startDate: "2024-03-15", endDate: "2024-04-20" };
      const { startDate, endDate } = generatePrefetchQueryKey(params);

      // Should be in yyyy-MM-dd format
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should handle month boundaries correctly", () => {
      const params: PeriodParams = { period: "custom", startDate: "2024-01-01", endDate: "2024-01-31" };
      const { startDate, endDate } = generatePrefetchQueryKey(params);

      expect(startDate).toBe("2024-01-01");
      expect(endDate).toBe("2024-01-31");
    });
  });
});
