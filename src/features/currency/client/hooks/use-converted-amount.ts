import { useQuery } from "@tanstack/react-query";
import { convertCurrencyAction } from "@/features/currency/server/actions";
import { queryKeys } from "@/lib/query-keys";

interface ConversionData {
  amount: number;
  from: string;
  to: string;
  date?: string;
  converted: number;
}

export function useConvertedAmount(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  date?: string | null
) {
  // If same currency or missing info, return amount immediately
  const isSameCurrency = from === to;
  const isMissingInfo = amount === 0 || from == null || from === "" || to == null || to === "" || from === "unknown" || to === "unknown";

  const { data, isLoading, error } = useQuery<ConversionData>({
    queryKey: queryKeys.convert(amount, from!, to!, date ?? undefined),
    queryFn: async () => {
      const result = await convertCurrencyAction(amount, from!, to!, date ?? undefined);
      return {
        amount,
        from: from!,
        to: to!,
        date: date ?? undefined,
        converted: result.converted,
      };
    },
    enabled: !isSameCurrency && !isMissingInfo, // isMissingInfo is already boolean
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
  });

  if (isSameCurrency || isMissingInfo) {
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
