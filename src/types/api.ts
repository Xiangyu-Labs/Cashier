

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

export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  aiResponse: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proposedTransactions?: any[] | null;
  createdAt: string;
  status?: "queued" | "processing" | "to_confirm" | "completed" | "failed" | "invalid";
  error?: string | null;
}

export interface Transaction {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  receiptId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  transactionDate: string | null;
  createdAt: string;
  category?: Category | null;
  receipt?: Receipt | null;
}

export interface TransactionSummary {
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

export interface ReceiptResponse {
  receiptId: string;
  transactions: Transaction[];
}
