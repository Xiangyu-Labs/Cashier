import { getCurrencyDecimals } from "@/lib/money/currency-precision";

const numberFormatters = new Map<string, Intl.NumberFormat>();

function getNumberFormatter(locale: string | undefined, options: Intl.NumberFormatOptions) {
  const key = `${locale ?? "default"}:${JSON.stringify(options)}`;
  let formatter = numberFormatters.get(key);
  if (formatter == null) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatCurrencyAmount(
  amount: string | number,
  currency: string,
  locale?: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const decimals = getCurrencyDecimals(currency);
  try {
    const formatter = getNumberFormatter(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    });
    return (formatter.format as (value: string | number) => string)(amount);
  } catch {
    const formatter = getNumberFormatter(locale, {
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
  const formatter = getNumberFormatter(locale, {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return (formatter.format as (value: string | number) => string)(amount);
}

export function getCurrencySymbol(currency: string, locale?: string): string {
  if (currency === "" || currency === "unknown") return "?";

  try {
    const currencyPart = getNumberFormatter(locale, {
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
