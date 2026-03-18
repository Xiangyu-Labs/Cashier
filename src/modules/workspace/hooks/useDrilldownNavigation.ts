"use client";

import { useCallback } from "react";
import { useRouter } from "@/i18n/routing";
import { updateLedgerSearchParams } from "@/modules/workspace/ledger-url-params";
import { replaceAndNavigateLedgerUrl } from "@/modules/workspace/ledger-url-navigation";

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
      const params = updateLedgerSearchParams(searchParams, {
        tab: "details",
        period: "custom",
        startDate,
        endDate,
        categoryId,
      });
      replaceAndNavigateLedgerUrl(pathname, params, router);
    },
    [searchParams, pathname, router]
  );

  const handleDateDrilldown = useCallback(
    (date: string, filters?: { currency?: string | null; categoryId?: string | null }) => {
      const params = updateLedgerSearchParams(searchParams, {
        tab: "details",
        period: "custom",
        startDate: date,
        endDate: date,
        categoryId: filters?.categoryId ?? null,
        currency: filters?.currency ?? null,
      });
      replaceAndNavigateLedgerUrl(pathname, params, router);
    },
    [searchParams, pathname, router]
  );

  return {
    handleCategoryDrilldown,
    handleDateDrilldown,
  };
}
