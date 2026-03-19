export function convertAmount({
  amount,
  fromCurrency,
  toCurrency,
  rates,
  baseCurrency = "EUR",
}: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rates: Record<string, number> | null;
  baseCurrency?: string;
}): number {
  if (fromCurrency === "" || toCurrency === "" || fromCurrency === toCurrency) {
    return amount;
  }

  if (rates == null) {
    return amount;
  }

  const sourceRate = fromCurrency === baseCurrency ? 1 : rates[fromCurrency];
  const targetRate = toCurrency === baseCurrency ? 1 : rates[toCurrency];

  if (sourceRate === undefined || targetRate === undefined) {
    return amount;
  }

  return (amount / sourceRate) * targetRate;
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
