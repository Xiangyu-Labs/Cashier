import {
  Ledger,
  Category,
  Transaction,
  TransactionSummary,
  MessageResponse,
  InputMessage,
  Settings,
} from "@/types/api";

const API_BASE = "/api";

async function request<T>(
  url: string,
  options?: RequestInit,
  errorMessage = "Request failed"
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(errorMessage);
  // Handle 204 No Content or empty responses if needed, but current API seems to always return JSON or void
  // If void/no content is possible, we might need to check content-length or status text
  if (res.status === 204) return {} as T;
  return res.json();
}

// Settings API
export function fetchSettings(): Promise<Settings> {
  return request(`${API_BASE}/settings`, undefined, "Failed to fetch settings");
}

export function updateSettings(data: Partial<Settings>): Promise<Settings> {
  return request(
    `${API_BASE}/settings`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update settings"
  );
}

// Ledger API
export function fetchLedgers(): Promise<Ledger[]> {
  return request(`${API_BASE}/ledgers`, undefined, "Failed to fetch ledgers");
}

export function fetchLedger(id: string): Promise<Ledger> {
  return request(`${API_BASE}/ledgers/${id}`, undefined, "Failed to fetch ledger");
}

export function createLedger(data: { name: string }): Promise<Ledger> {
  return request(
    `${API_BASE}/ledgers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create ledger"
  );
}

export function updateLedger(
  id: string,
  data: { name?: string; language?: string; currencies?: string[]; autoConfirm?: boolean }
): Promise<Ledger> {
  return request(
    `${API_BASE}/ledgers/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update ledger"
  );
}

export function deleteLedger(id: string): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${id}`,
    {
      method: "DELETE",
    },
    "Failed to delete ledger"
  );
}

// Category API
// We use "global" as the ID since the backend logic ignores it now.
const GLOBAL_ID = "global";

export function fetchCategories(ledgerId: string = GLOBAL_ID): Promise<Category[]> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/categories`,
    undefined,
    "Failed to fetch categories"
  );
}

export function createCategory(
  ledgerId: string = GLOBAL_ID,
  data: { name: string; description?: string; icon?: string }
): Promise<Category> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/categories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create category"
  );
}

export function updateCategory(
  ledgerId: string = GLOBAL_ID,
  categoryId: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  }
): Promise<Category> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/categories/${categoryId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update category"
  );
}

export function deleteCategory(
  ledgerId: string = GLOBAL_ID,
  categoryId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/categories/${categoryId}`,
    {
      method: "DELETE",
    },
    "Failed to delete category"
  );
}

export function reorderCategories(
  ledgerId: string = GLOBAL_ID,
  categoryIds: string[]
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/categories/reorder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryIds }),
    },
    "Failed to reorder categories"
  );
}

// Transaction API
export function fetchTransactions(
  ledgerId: string,
  params?: { status?: "pending" | "confirmed"; limit?: number; offset?: number }
): Promise<Transaction[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions?${searchParams}`,
    undefined,
    "Failed to fetch transactions"
  );
}

export function updateTransaction(
  ledgerId: string,
  transactionId: string,
  data: {
    categoryId?: string | null;
    amount?: number;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
    status?: "pending" | "confirmed";
  }
): Promise<Transaction> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions/${transactionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update transaction"
  );
}

export function deleteTransaction(
  ledgerId: string,
  transactionId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions/${transactionId}`,
    {
      method: "DELETE",
    },
    "Failed to delete transaction"
  );
}

export function confirmTransactions(
  ledgerId: string,
  data: { transactionIds?: string[]; confirmAll?: boolean }
): Promise<{ success: boolean; updatedCount: number }> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to confirm transactions"
  );
}

export function fetchTransactionSummary(
  ledgerId: string,
  status?: "pending" | "confirmed"
): Promise<TransactionSummary> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions/summary?${searchParams}`,
    undefined,
    "Failed to fetch summary"
  );
}

// Message API
export function sendMessage(
  ledgerId: string,
  data: {
    text?: string;
    images?: { data: string; mimeType: string }[];
    audio?: { data: string; mimeType: string };
  }
): Promise<MessageResponse> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to send message"
  );
}

export function fetchInputMessages(
  ledgerId: string,
  status?: string[]
): Promise<InputMessage[]> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status.join(","));

  return request(
    `${API_BASE}/ledgers/${ledgerId}/messages?${searchParams}`,
    undefined,
    "Failed to fetch messages"
  );
}

export function retryMessage(
  ledgerId: string,
  messageId: string
): Promise<{ success: boolean; message: string }> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/messages/${messageId}/retry`,
    {
      method: "POST",
    },
    "Failed to retry message"
  );
}
