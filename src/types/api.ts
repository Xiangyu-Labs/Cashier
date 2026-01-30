

export interface Ledger {
  id: string;
  name: string;
  aiLanguage: string;
  currencies: string[];
  mainCurrency: string;
  createdAt: string;
  updatedAt: string;
  autoRecognizeDate: boolean;
  collapsePendingDefault: boolean;
  mergeSimilarItems: boolean;
  collapseBillsDefault: boolean;
  aiCustomPrompt: string;
}

export interface Settings {
  id: string;
  aiLanguage: string;
  currencies: string[];
  mainCurrency?: string;
  autoRecognizeDate?: boolean;
}

export interface EntryCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocument {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  createdAt: string;
  status?: "queued" | "processing" | "completed" | "anomaly";
  anomalyCodes?: string[] | null;
}

export interface LedgerEntry {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  entryDate: string | null;
  anomalyCodes?: string[] | null;
  createdAt: string;
  category?: EntryCategory | null;
  sourceDocument?: SourceDocument | null;
}

export interface LedgerEntrySummary {
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    categoryIcon: string | null;
    currency: string | null;
    total: number;
    count: number;
  }[];
  totals: {
    currency: string | null;
    total: number;
    count: number;
  }[];
  trend: {
    date: string;
    total: number;
  }[];
  convertedTotal?: {
    currency: string;
    total: number;
    conversions: {
      fromCurrency: string | null;
      originalTotal: number;
      convertedTotal: number;
      count: number;
    }[];
  };
}

export interface SourceDocumentResponse {
  sourceDocumentId: string;
  ledgerEntries: LedgerEntry[];
}
