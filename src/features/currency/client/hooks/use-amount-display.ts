"use client";

import { useConvertedAmount } from "./use-converted-amount";

interface UseAmountDisplayOptions {
  amount: number;
  currency: string | null | undefined;
  mainCurrency: string;
  date?: string | null;
}

interface UseAmountDisplayReturn {
  /** The converted amount (same as amount if same currency) */
  converted: number;
  /** The amount to display (converted if different currency) */
  displayAmount: number;
  /** Whether the currency is different from main currency */
  isDifferentCurrency: boolean;
  /** Whether the conversion is loading */
  isLoading: boolean;
  /** The original currency code */
  originalCurrency: string;
  /** The main currency code */
  mainCurrency: string;
}

/**
 * Hook for displaying amounts with currency conversion.
 * Handles conversion logic and currency difference detection.
 */
export function useAmountDisplay({
  amount,
  currency,
  mainCurrency,
  date,
}: UseAmountDisplayOptions): UseAmountDisplayReturn {
  const { converted, isLoading } = useConvertedAmount(amount, currency, mainCurrency, date);

  const isDifferentCurrency = Boolean(
    currency && currency !== mainCurrency && currency !== "unknown"
  );

  return {
    converted,
    displayAmount: isDifferentCurrency ? converted : amount,
    isDifferentCurrency,
    isLoading,
    originalCurrency: currency || "?",
    mainCurrency,
  };
}
