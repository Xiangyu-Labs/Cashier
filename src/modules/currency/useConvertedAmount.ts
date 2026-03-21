import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { convertCurrencyAction, type ConvertCurrencyResult } from "./actions";

export function useConvertedAmount(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  date?: string | null
) {
  const normalizedFrom =
    from == null || from === "" || from === "unknown" ? null : from;
  const normalizedTo = to == null || to === "" || to === "unknown" ? null : to;
  const normalizedDate = date == null || date === "" ? undefined : date;

  // If same currency or missing info, return amount immediately
  const isSameCurrency = normalizedFrom != null && normalizedFrom === normalizedTo;
  const isMissingInfo = amount === 0 || normalizedFrom == null || normalizedTo == null;
  const canConvert = !isSameCurrency && !isMissingInfo;

  const { data, isLoading, error } = useQuery<ConvertCurrencyResult>({
    queryKey: queryKeys.convert(
      amount,
      normalizedFrom ?? "__missing_from__",
      normalizedTo ?? "__missing_to__",
      normalizedDate
    ),
    queryFn: async () => {
      if (normalizedFrom == null || normalizedTo == null) {
        return { converted: amount };
      }
      return convertCurrencyAction(amount, normalizedFrom, normalizedTo, normalizedDate);
    },
    enabled: canConvert,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });

  if (!canConvert) {
    return {
      converted: amount,
      isLoading: false,
      error: null,
    };
  }

  return {
    converted: data?.converted ?? amount,
    isLoading,
    error,
  };
}
