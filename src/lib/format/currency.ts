import { getCurrencyDecimals } from "@/lib/money/currency-precision";

export function formatCurrencyAmount(
  amount: number,
  currency: string,
  locale?: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const decimals = getCurrencyDecimals(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    }).format(amount);
  } catch {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    }).format(amount);

    return `¤${formatted}`;
  }
}

export function formatCompactCurrencyAmount(
  amount: number,
  currency: string,
  locale?: string
): string {
  return formatCurrencyAmount(amount, currency, locale, {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export function formatCompactNumberAmount(amount: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(amount);
}

export function getCurrencySymbol(currency: string, locale?: string): string {
  if (currency === "" || currency === "unknown") return "?";

  try {
    const currencyPart = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency");

    return currencyPart?.value ?? "¤";
  } catch {
    return "¤";
  }
}
