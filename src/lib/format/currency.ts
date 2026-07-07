export function formatCurrencyAmount(
  amount: number,
  currency: string,
  locale: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);

  return `${currency} ${formatted}`;
}

export function formatCompactCurrencyAmount(
  amount: number,
  currency: string,
  locale: string
): string {
  const formatted = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);

  return `${currency} ${formatted}`;
}
