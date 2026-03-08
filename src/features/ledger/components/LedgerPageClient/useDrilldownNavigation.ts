/**
 * Drilldown Navigation Hook
 *
 * Handles drilldown navigation from stats to details tab with filters.
 * All filter state is now stored in URL parameters for consistency.
 */

import { useCallback, startTransition } from "react";
import { useRouter } from "@/i18n/routing";

interface UseDrilldownNavigationOptions {
  searchParams: URLSearchParams;
  pathname: string;
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
}: UseDrilldownNavigationOptions): UseDrilldownNavigationResult {
  const router = useRouter();

  const handleCategoryDrilldown = useCallback(
    (categoryId: string, startDate: string, endDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "details");
      params.set("period", "custom");
      params.set("startDate", startDate);
      params.set("endDate", endDate);

      // Add categoryId to URL if present and not uncategorized
      if (categoryId && categoryId !== "__uncategorized__") {
        params.set("categoryId", categoryId);
      } else {
        params.delete("categoryId");
      }

      const newUrl = `${pathname}?${params.toString()}`;
      // 立即更新 URL（同步）
      window.history.replaceState(null, "", newUrl);
      // 使用 startTransition 让 React 知道这是低优先级更新
      startTransition(() => {
        router.replace(newUrl, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );

  const handleDateDrilldown = useCallback(
    (date: string, filters?: { currency?: string | null; categoryId?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "details");
      params.set("period", "custom");
      params.set("startDate", date);
      params.set("endDate", date);

      // Add filter params to URL
      if (filters?.categoryId && filters.categoryId !== "__uncategorized__") {
        params.set("categoryId", filters.categoryId);
      } else {
        params.delete("categoryId");
      }

      if (filters?.currency) {
        params.set("currency", filters.currency);
      } else {
        params.delete("currency");
      }

      const newUrl = `${pathname}?${params.toString()}`;
      // 立即更新 URL（同步）
      window.history.replaceState(null, "", newUrl);
      // 使用 startTransition 让 React 知道这是低优先级更新
      startTransition(() => {
        router.replace(newUrl, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );

  return {
    handleCategoryDrilldown,
    handleDateDrilldown,
  };
}
