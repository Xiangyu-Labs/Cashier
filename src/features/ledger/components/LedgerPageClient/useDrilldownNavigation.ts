/**
 * Drilldown Navigation Hook
 *
 * Handles drilldown navigation from stats to details tab with filters.
 */

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { PeriodParams } from "@/lib/period-utils";

interface FiltersState {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
}

interface UseDrilldownNavigationOptions {
  searchParams: URLSearchParams;
  pathname: string;
  setActiveTab: (tab: string) => void;
  setAdvancedFilters: Dispatch<SetStateAction<FiltersState>>;
  handlePeriodChange: (period: PeriodParams, options?: { skipUrlUpdate?: boolean }) => void;
}

interface UseDrilldownNavigationResult {
  handleCategoryDrilldown: (categoryId: string, startDate: string, endDate: string) => void;
  handleDateDrilldown: (
    date: string,
    filters?: { currency?: string | null; categoryId?: string | null }
  ) => void;
}

export function useDrilldownNavigation({
  searchParams,
  pathname,
  setActiveTab,
  setAdvancedFilters,
  handlePeriodChange,
}: UseDrilldownNavigationOptions): UseDrilldownNavigationResult {
  const handleCategoryDrilldown = useCallback(
    (categoryId: string, startDate: string, endDate: string) => {
      setAdvancedFilters((prev: FiltersState) => ({
        ...prev,
        categoryId: categoryId === "__uncategorized__" ? null : categoryId,
      }));
      setActiveTab("details");
      handlePeriodChange(
        { period: "custom", startDate, endDate },
        { skipUrlUpdate: true }
      );

      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "details");
      params.set("period", "custom");
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, setActiveTab, setAdvancedFilters, handlePeriodChange]
  );

  const handleDateDrilldown = useCallback(
    (date: string, filters?: { currency?: string | null; categoryId?: string | null }) => {
      if (filters) {
        setAdvancedFilters((prev: FiltersState) => ({
          ...prev,
          ...(filters.currency !== undefined && { currency: filters.currency }),
          ...(filters.categoryId !== undefined && { categoryId: filters.categoryId }),
        }));
      }

      setActiveTab("details");
      handlePeriodChange(
        { period: "custom", startDate: date, endDate: date },
        { skipUrlUpdate: true }
      );

      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "details");
      params.set("period", "custom");
      params.set("startDate", date);
      params.set("endDate", date);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, setActiveTab, setAdvancedFilters, handlePeriodChange]
  );

  return {
    handleCategoryDrilldown,
    handleDateDrilldown,
  };
}
