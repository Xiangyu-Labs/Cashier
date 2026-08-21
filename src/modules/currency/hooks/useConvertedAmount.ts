import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { convertCurrencyAction } from "../actions";
import type { ConvertCurrencyResult } from "../contracts";

export type UseConvertedAmountReturn =
  | { status: "idle"; converted: number }
  | { status: "loading"; converted: null }
  | { status: "success"; converted: number }
  | { status: "error"; converted: null; error: Error };

export interface UseConvertedAmountOptions {
  /** Disable the live conversion query (e.g. when a persisted value is authoritative). */
  enabled?: boolean;
}

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(date?: string | null): string | undefined {
  if (date == null || date === "") return undefined;
  const [datePart] = date.split("T");
  return datePart != null && datePart !== "" ? datePart : undefined;
}

export function useConvertedAmount(
  ledgerId: string,
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  date?: string | null,
  options: UseConvertedAmountOptions = {}
): UseConvertedAmountReturn {
  const normalizedFrom = from == null || from === "" || from === "unknown" ? null : from;
  const normalizedTo = to == null || to === "" || to === "unknown" ? null : to;
  const requestedDate = normalizeDate(date);
  const localToday = getLocalDateString();
  const effectiveDate = requestedDate ?? localToday;

  const isSameCurrency = normalizedFrom != null && normalizedFrom === normalizedTo;
  const isMissingInfo = amount === 0 || normalizedFrom == null || normalizedTo == null;
  const canConvert = options.enabled !== false && !isSameCurrency && !isMissingInfo;

  const { data, isLoading, error } = useQuery<ConvertCurrencyResult>({
    queryKey: queryKeys.convert(
      String(amount),
      normalizedFrom ?? "__missing_from__",
      normalizedTo ?? "__missing_to__",
      effectiveDate
    ),
    queryFn: async () => {
      if (normalizedFrom == null || normalizedTo == null) {
        return { converted: String(amount) };
      }

      return convertCurrencyAction(
        ledgerId,
        String(amount),
        normalizedFrom,
        normalizedTo,
        requestedDate
      );
    },
    enabled: canConvert,
    // Historical dates are immutable; only today's "live" conversion may
    // change within a day, so it is kept fresh for one hour.
    staleTime: effectiveDate === localToday ? 1000 * 60 * 60 : Infinity,
  });

  if (!canConvert) {
    return {
      status: "idle",
      converted: amount,
    };
  }

  if (isLoading) {
    return { status: "loading", converted: null };
  }

  if (error != null) {
    return { status: "error", converted: null, error };
  }

  return {
    status: "success",
    converted: data?.converted != null ? Number.parseFloat(data.converted) : amount,
  };
}
