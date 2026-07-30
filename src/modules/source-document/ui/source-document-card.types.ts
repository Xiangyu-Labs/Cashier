export interface SourceDocumentCardCurrencyBreakdown {
  currency: string;
  amount: number;
  convertedAmount?: number;
}

export interface SourceDocumentCardTotals {
  subtotalsByCurrency: Record<string, number>;
  totalInMainCurrency: number;
  breakdownData: SourceDocumentCardCurrencyBreakdown[];
}
