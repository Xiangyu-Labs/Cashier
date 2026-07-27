"use client";
import { useCallback } from "react";
import { updateLedgerSearchParams } from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchDetailsTabQuery } from "../prefetch-ledger-tabs";

interface UseDrilldownNavigationOptions {
  searchParams: URLSearchParams;
  pathname: string;
  ledgerId: string;
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
  ledgerId,
}: UseDrilldownNavigationOptions): UseDrilldownNavigationResult {
  const queryClient = useQueryClient();
  const handleCategoryDrilldown = useCallback(
    (categoryId: string, startDate: string, endDate: string) => {
      const params = updateLedgerSearchParams(
        searchParams,
        { tab: "details", period: "custom", startDate, endDate, categoryId },
        "details"
      );
      void prefetchDetailsTabQuery(
        queryClient,
        ledgerId,
        { period: "custom", startDate, endDate },
        { categoryId }
      );
      replaceLedgerUrl(pathname, params);
    },
    [ledgerId, pathname, queryClient, searchParams]
  );

  const handleDateDrilldown = useCallback(
    (date: string, filters?: { currency?: string | null; categoryId?: string | null }) => {
      const existingCategoryId =
        searchParams.get("detailsCategoryId") ?? searchParams.get("categoryId");
      const nextCategoryId =
        filters?.categoryId !== undefined ? filters.categoryId : (existingCategoryId ?? null);

      const params = updateLedgerSearchParams(
        searchParams,
        {
          tab: "details",
          period: "custom",
          startDate: date,
          endDate: date,
          categoryId: nextCategoryId,
          currency: filters?.currency ?? null,
        },
        "details"
      );
      void prefetchDetailsTabQuery(
        queryClient,
        ledgerId,
        { period: "custom", startDate: date, endDate: date },
        { categoryId: nextCategoryId, currency: filters?.currency ?? null }
      );
      replaceLedgerUrl(pathname, params);
    },
    [ledgerId, pathname, queryClient, searchParams]
  );

  return {
    handleCategoryDrilldown,
    handleDateDrilldown,
  };
}
