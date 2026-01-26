export interface Ledger {
  id: string;
  name: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
}

export interface Category {
  id: string;
  ledgerId: string;
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
  contentType: "text" | "image" | "audio";
  content: string;
  aiResponse: string | null;
  createdAt: string;
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
  status: "pending" | "confirmed";
  sourceType: "text" | "image" | "audio" | "mixed";
  transactionDate: string | null;
  createdAt: string;
  category?: Category | null;
  inputMessage?: InputMessage | null;
  metadata?: {
    quantity?: number;
    unitPrice?: number;
    originalName?: string;
    [key: string]: any;
  } | null;
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
}

export interface MessageResponse {
  messageId: string;
  transactions: Transaction[];
}
