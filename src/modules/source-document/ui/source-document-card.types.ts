import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";

export interface SourceDocumentCardPreviewData {
  text: string;
  images: SourceDocumentStoredFileDto[];
}

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
