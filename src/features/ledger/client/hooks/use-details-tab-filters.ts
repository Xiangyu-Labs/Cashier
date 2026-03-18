"use client";

import { useCallback, useMemo } from "react";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { periodToDateRange, type PeriodParams } from "@/lib/period-utils";
import type { EntryFilters } from "../../components/EntryFilterPanel";

export interface UseDetailsTabFiltersReturn {
  filters: EntryFilters;
  filterKey: string | null;
  handleFiltersChange: (
    onPeriodChange: (params: PeriodParams) => void,
    onAdvancedFiltersChange: (filters: {
      categoryId?: string | null;
      currency?: string | null;
      minAmount?: number | null;
      maxAmount?: number | null;
    }) => void
  ) => (newFilters: EntryFilters) => void;
}

interface UseDetailsTabFiltersProps {
  periodParams: PeriodParams;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  };
}

export function useDetailsTabFilters({
  periodParams,
  advancedFilters,
}: UseDetailsTabFiltersProps): UseDetailsTabFiltersReturn {
  // Convert periodParams to date range
  const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

  // Combine period-based dates with advanced filters
  const filters: EntryFilters = useMemo(
    () => ({
      startDate: dateRange.startDate != null ? parseDateString(dateRange.startDate) : undefined,
      endDate: dateRange.endDate != null ? parseDateString(dateRange.endDate) : undefined,
      ...advancedFilters,
    }),
    [dateRange, advancedFilters]
  );

  // Build filter key for queryKey
  const filterKey = useMemo(() => {
    const parts: string[] = [];
    if (filters.categoryId != null && filters.categoryId !== "") parts.push(`cat:${filters.categoryId}`);
    if (filters.currency != null && filters.currency !== "") parts.push(`cur:${filters.currency}`);
    if (filters.minAmount !== undefined && filters.minAmount !== null)
      parts.push(`min:${filters.minAmount}`);
    if (filters.maxAmount !== undefined && filters.maxAmount !== null)
      parts.push(`max:${filters.maxAmount}`);
    return parts.length > 0 ? parts.join("|") : null;
  }, [filters.categoryId, filters.currency, filters.minAmount, filters.maxAmount]);

  // Handle filter changes - distinguish between period changes and additional filter changes
  const handleFiltersChange = useCallback(
    (
      onPeriodChange: (params: PeriodParams) => void,
      onAdvancedFiltersChange: (filters: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
      }) => void
    ) =>
      (newFilters: EntryFilters) => {
        // If dates changed, propagate to parent (period change)
        const newStartStr = formatDateTimeForApi(newFilters.startDate);
        const newEndStr = formatDateTimeForApi(newFilters.endDate);
        const currentStartStr = formatDateTimeForApi(filters.startDate);
        const currentEndStr = formatDateTimeForApi(filters.endDate);

        if (newStartStr !== currentStartStr || newEndStr !== currentEndStr) {
          onPeriodChange({
            period: "custom",
            startDate: newStartStr,
            endDate: newEndStr,
          });
        }

        // Update advanced filters (category, currency, amount)
        onAdvancedFiltersChange({
          categoryId: newFilters.categoryId,
          currency: newFilters.currency,
          minAmount: newFilters.minAmount,
          maxAmount: newFilters.maxAmount,
        });
      },
    [filters.startDate, filters.endDate]
  );

  return {
    filters,
    filterKey,
    handleFiltersChange,
  };
}
