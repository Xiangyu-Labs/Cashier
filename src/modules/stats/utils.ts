import Decimal from "decimal.js";

export function convertAmount({
  amount,
  fromCurrency,
  toCurrency,
  rates,
  baseCurrency = "EUR",
}: {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  rates: Record<string, string> | null;
  baseCurrency?: string;
}): string {
  if (fromCurrency === "" || toCurrency === "" || fromCurrency === toCurrency) {
    return amount;
  }

  if (rates == null) {
    return amount;
  }

  const sourceRate = fromCurrency === baseCurrency ? "1" : rates[fromCurrency];
  const targetRate = toCurrency === baseCurrency ? "1" : rates[toCurrency];

  if (sourceRate === undefined || targetRate === undefined) {
    return amount;
  }

  // Use Decimal arithmetic: (amount / sourceRate) * targetRate
  return new Decimal(amount).dividedBy(sourceRate).times(targetRate).toFixed();
}

export function calculateGrowth(
  current: number,
  previous: number
): { percent: number; amount: number } {
  const diff = current - previous;
  if (previous === 0) {
    return {
      amount: diff,
      percent: current === 0 ? 0 : 100,
    };
  }

  return {
    amount: diff,
    percent: (diff / previous) * 100,
  };
}
