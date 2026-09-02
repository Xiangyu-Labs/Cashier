interface SourceDocumentCardCurrencyBreakdown {
  currency: string;
  amount: string;
  convertedAmount?: string;
}

export interface SourceDocumentCardTotals {
  subtotalsByCurrency: Record<string, string>;
  totalInMainCurrency: string;
  breakdownData: SourceDocumentCardCurrencyBreakdown[];
}
