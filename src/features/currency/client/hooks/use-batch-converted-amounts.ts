import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  batchConvertCurrencyAction,
  type BatchConversionItem,
} from "@/features/currency/server/actions";
import { queryKeys } from "@/lib/query-keys";

interface UseBatchConvertedAmountsResult {
  results: number[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for batch currency conversion.
 * Converts multiple amounts to a target currency in a single request.
 *
 * @param items - Array of items with amount, currency, and optional date
 * @param targetCurrency - The currency to convert all amounts to
 * @returns Object with results array (same order as input), loading state, and error
 */
export function useBatchConvertedAmounts(
  items: BatchConversionItem[],
  targetCurrency: string | null | undefined
): UseBatchConvertedAmountsResult {
  // Generate a stable cache key based on input (optimized - no JSON.stringify)
  const cacheKey = useMemo(
    () => items.map((i) => `${i.amount}:${i.currency}:${i.date?.split("T")[0] || ""}`).join("|"),
    [items]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.batchConvert(cacheKey, targetCurrency!),
    queryFn: async () => {
      const result = await batchConvertCurrencyAction(items, targetCurrency!);
      return result.results;
    },
    enabled: items.length > 0 && !!targetCurrency,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });

  // Return original amounts as fallback when loading or no target currency
  if (!targetCurrency || items.length === 0) {
    return {
      results: items.map((i) => i.amount),
      isLoading: false,
      error: null,
    };
  }

  return {
    results: data || items.map((i) => i.amount),
    isLoading,
    error: error as Error | null,
  };
}
