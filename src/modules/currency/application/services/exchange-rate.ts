import { format } from "date-fns";
import { AppError } from "@/lib/errors";
export type {
  ExchangeRates,
  ExchangeRatesStoredEvent,
  ExchangeRatesStoredHandler,
  FxRateBook,
} from "../ports";

export function formatExchangeRateDate(date: Date | string): string {
  if (typeof date === "string") return date.split("T")[0] ?? date;
  return format(date, "yyyy-MM-dd");
}

export async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * 2 ** attempt));
    }
  }
  throw new AppError("Unreachable", "UNREACHABLE_CODE_PATH");
}
