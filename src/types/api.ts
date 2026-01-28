

export interface Ledger {
  id: string;
  name: string;
  language: string;
  currencies: string[];
  createdAt: string;
  updatedAt: string;
  autoConfirm: boolean;
  autoRecognizeDate: boolean;
  collapsePendingDefault: boolean;
  mergeSimilarItems: boolean;
}

export interface Settings {
  id: string;
  language: string;
  currencies: string[];
  autoConfirm?: boolean;
  autoRecognizeDate?: boolean;
}

export interface EntryCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocument {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  aiResponse: string | null;
  createdAt: string;
  status?: "queued" | "processing" | "to_confirm" | "completed" | "error";
  errorCode?: "internal_error" | "parse_failed" | "invalid_content" | null;
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
  status?: "pending" | "confirmed";
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
}

export interface SourceDocumentResponse {
  sourceDocumentId: string;
  ledgerEntries: LedgerEntry[];
}
