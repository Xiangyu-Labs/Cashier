import { getCurrencyDecimals } from "@/lib/money/currency-precision";

export function formatCurrencyAmount(
  amount: string | number,
  currency: string,
  locale?: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const decimals = getCurrencyDecimals(currency);
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    });
    return (formatter.format as (value: string | number) => string)(amount);
  } catch {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    });
    const formatted = (formatter.format as (value: string | number) => string)(amount);

    return `¤${formatted}`;
  }
}

export function formatCompactCurrencyAmount(
  amount: string | number,
  currency: string,
  locale?: string
): string {
  return formatCurrencyAmount(amount, currency, locale, {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export function formatCompactNumberAmount(amount: string | number, locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return (formatter.format as (value: string | number) => string)(amount);
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
