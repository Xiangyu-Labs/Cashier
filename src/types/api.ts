

export interface Ledger {
  id: string;
  name: string;
  language: string;
  currencies: string[];
  createdAt: string;
  updatedAt: string;
  autoConfirm: boolean;
}

export interface Settings {
  id: string;
  language: string;
  currencies: string[];
  autoConfirm?: boolean;
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

export interface InputMessage {
  id: string;
  ledgerId: string;
  text: string | null;
  imageUrls: string[];
  aiResponse: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proposedTransactions?: any[] | null;
  createdAt: string;
  status?: "queued" | "processing" | "to_confirm" | "completed" | "failed";
  error?: string | null;
}

export interface Transaction {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  inputMessageId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  transactionDate: string | null;
  createdAt: string;
  category?: Category | null;
  inputMessage?: InputMessage | null;
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

export interface MessageResponse {
  messageId: string;
  transactions: Transaction[];
}
