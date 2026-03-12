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
   * Simulates how useDetailsTabData generates Query Keys
   * This is the correct reference implementation
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

    const filterKey = null; // No advanced filters in this test

    const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDateStr, endDateStr, mainCurrency, filterKey);
    const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr, filterKey);

    return { summaryKey, entriesKey, startDate: startDateStr, endDate: endDateStr };
  }

  /**
   * FIXED: Simulates how usePrefetchRelatedData should generate Query Keys (AFTER FIX)
   * Uses the same logic as useDetailsTabData without extra date conversions
   */
  function generateFixedPrefetchQueryKey(periodParams: PeriodParams) {
    const dateRange = periodToDateRange(periodParams);

    // FIXED: Use dates directly without extra new Date() conversion
    const startDate = dateRange.startDate;
    const endDate = dateRange.endDate;

    const summaryKey = queryKeys.ledgerEntries(ledgerId, "summary", startDate, endDate, mainCurrency, null);
    const entriesKey = queryKeys.ledgerEntries(ledgerId, "infinite", startDate, endDate, null);

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
        const fixedPrefetch = generateFixedPrefetchQueryKey(params);

        // The fixed prefetch should match details exactly
        expect(fixedPrefetch.summaryKey).toEqual(details.summaryKey);
        expect(fixedPrefetch.entriesKey).toEqual(details.entriesKey);
        expect(fixedPrefetch.startDate).toBe(details.startDate);
        expect(fixedPrefetch.endDate).toBe(details.endDate);
      });
    });

    it("should handle advanced filters correctly", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const dateRange = periodToDateRange(params);

      // Simulate building filterKey in useDetailsTabData
      const advancedFilters = {
        categoryId: "cat-123",
        currency: "USD",
        minAmount: 100,
        maxAmount: 1000,
      };

      const parts: string[] = [];
      if (advancedFilters.categoryId) parts.push(`cat:${advancedFilters.categoryId}`);
      if (advancedFilters.currency) parts.push(`cur:${advancedFilters.currency}`);
      if (advancedFilters.minAmount !== undefined && advancedFilters.minAmount !== null)
        parts.push(`min:${advancedFilters.minAmount}`);
      if (advancedFilters.maxAmount !== undefined && advancedFilters.maxAmount !== null)
        parts.push(`max:${advancedFilters.maxAmount}`);
      const filterKey = parts.length > 0 ? parts.join("|") : null;

      // Query Key with filters
      const keyWithFilters = queryKeys.ledgerEntries(
        ledgerId,
        "summary",
        dateRange.startDate,
        dateRange.endDate,
        mainCurrency,
        filterKey
      );

      // Should contain the filter key as a single string
      expect(keyWithFilters).toContain(filterKey);
      expect(filterKey).toContain("cat:cat-123");
      expect(filterKey).toContain("cur:USD");
    });
  });

  describe("Query Key structure verification", () => {
    it("should have correct structure for summary query", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const { summaryKey } = generateFixedPrefetchQueryKey(params);

      expect(summaryKey[0]).toBe("ledgerEntries");
      expect(summaryKey[1]).toBe(ledgerId);
      expect(summaryKey[2]).toBe("summary");
      // startDate, endDate, mainCurrency, filterKey follow
      expect(summaryKey).toHaveLength(7);
    });

    it("should have correct structure for infinite query", () => {
      const params: PeriodParams = { period: "thisMonth" };
      const { entriesKey } = generateFixedPrefetchQueryKey(params);

      expect(entriesKey[0]).toBe("ledgerEntries");
      expect(entriesKey[1]).toBe(ledgerId);
      expect(entriesKey[2]).toBe("infinite");
      // startDate, endDate, filterKey follow
      expect(entriesKey).toHaveLength(6);
    });

    it("should filter out undefined values from Query Key", () => {
      // When period is 'all', dates are null
      const params: PeriodParams = { period: "all" };
      const { summaryKey } = generateFixedPrefetchQueryKey(params);

      // null values should still be included (they are not undefined)
      expect(summaryKey).toContain(null);
    });
  });

  describe("Date format consistency", () => {
    it("should produce yyyy-MM-dd format dates", () => {
      const params: PeriodParams = { period: "custom", startDate: "2024-03-15", endDate: "2024-04-20" };
      const { startDate, endDate } = generateFixedPrefetchQueryKey(params);

      // Should be in yyyy-MM-dd format
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should handle month boundaries correctly", () => {
      const params: PeriodParams = { period: "custom", startDate: "2024-01-01", endDate: "2024-01-31" };
      const { startDate, endDate } = generateFixedPrefetchQueryKey(params);

      expect(startDate).toBe("2024-01-01");
      expect(endDate).toBe("2024-01-31");
    });
  });
});
