import { format } from "date-fns";

export function formatExchangeRateDate(date: Date | string): string {
  if (typeof date === "string") {
    const [datePart] = date.split("T");
    return datePart ?? date;
  }

  return format(date, "yyyy-MM-dd");
}

export async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (err) {
      if (i === retries - 1) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }

  throw new Error("Unreachable");
}
