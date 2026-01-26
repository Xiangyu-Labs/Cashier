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

// API Keys
export interface ApiKey {
  id: string;
  name: string;
  key?: string; // Only present on creation usually, but our list might not return it? Checking backend.
  // Actually, backend 'list' returns all fields including key if we simply use findMany. 
  // Ideally we mask it, but for this MVP user said "show once" or "manage". 
  // Let's assume list returns masked or full? 
  // My backend logic `db.query.apiKeys.findMany` returns everything including the `key`. 
  // The user requirement said: "create... POST... key... create/delete in settings".
  // Usually we show key only on creation. 
  // Let's stick to the plan: List keys (id, name, created_at, last_used), Create -> returns key.
  createdAt: string;
  lastUsedAt?: string;
}

export function fetchApiKeys(ledgerId: string): Promise<ApiKey[]> {
  return request(`${API_BASE}/ledgers/${ledgerId}/api-keys`, undefined, "Failed to fetch API keys");
}

export function createApiKey(ledgerId: string, name: string): Promise<ApiKey> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/api-keys`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Failed to create API key"
  );
}

export function deleteApiKey(ledgerId: string, keyId: string): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/api-keys/${keyId}`,
    {
      method: "DELETE",
    },
    "Failed to delete API key"
  );
}
