import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { convertCurrencyAction } from "../actions";
import type { ConvertCurrencyResult } from "../contracts";

export function useConvertedAmount(
  ledgerId: string,
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  date?: string | null
) {
  const normalizedFrom = from == null || from === "" || from === "unknown" ? null : from;
  const normalizedTo = to == null || to === "" || to === "unknown" ? null : to;
  const normalizedDate = date == null || date === "" ? undefined : date;

  const isSameCurrency = normalizedFrom != null && normalizedFrom === normalizedTo;
  const isMissingInfo = amount === 0 || normalizedFrom == null || normalizedTo == null;
  const canConvert = !isSameCurrency && !isMissingInfo;

  const { data, isLoading, error } = useQuery<ConvertCurrencyResult>({
    queryKey: queryKeys.convert(
      ledgerId,
      amount,
      normalizedFrom ?? "__missing_from__",
      normalizedTo ?? "__missing_to__",
      normalizedDate
    ),
    queryFn: async () => {
      if (normalizedFrom == null || normalizedTo == null) {
        return { converted: String(amount) };
      }

      return convertCurrencyAction(ledgerId, amount, normalizedFrom, normalizedTo, normalizedDate);
    },
    enabled: canConvert,
    staleTime: 1000 * 60 * 60 * 24,
  });

  if (!canConvert) {
    return {
      converted: amount,
      isLoading: false,
      error: null,
    };
  }

  return {
    converted: data?.converted != null ? Number.parseFloat(data.converted) : amount,
    isLoading,
    error,
  };
}
