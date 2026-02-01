import { useQuery } from "@tanstack/react-query";
import { convertCurrencyAction } from "@/features/ledger/server/actions";

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
    const isMissingInfo = !amount || !from || !to || from === "unknown" || to === "unknown";

    const { data, isLoading, error } = useQuery<ConversionData>({
        queryKey: ["convert", amount, from, to, date],
        queryFn: async () => {
            const result = await convertCurrencyAction(amount, from!, to!, date || undefined);
            if (!result.success) throw new Error(result.error || "Conversion failed");
            return {
                amount,
                from: from!,
                to: to!,
                date: date || undefined,
                converted: result.converted!,
            };
        },
        enabled: !isSameCurrency && !isMissingInfo,
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
