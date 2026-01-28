import {
  Ledger,
  Category,
  Transaction,
  TransactionSummary,
  ReceiptResponse,
  Receipt,
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
  data: { name?: string; language?: string; currencies?: string[]; autoConfirm?: boolean; autoRecognizeDate?: boolean; collapsePendingDefault?: boolean }
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
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

// Transaction API
export function fetchTransactions(
  ledgerId: string,
  params?: {
    status?: "pending" | "confirmed";
    limit?: number;
    offset?: number;
    cursor?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<PaginatedResponse<Transaction>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);

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
  status?: "pending" | "confirmed",
  startDate?: string,
  endDate?: string
): Promise<TransactionSummary> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);
  if (startDate) searchParams.set("startDate", startDate);
  if (endDate) searchParams.set("endDate", endDate);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/transactions/summary?${searchParams}`,
    undefined,
    "Failed to fetch summary"
  );
}

// Receipt API
export function createReceipt(
  ledgerId: string,
  data: {
    text?: string;
    images?: { data: string; mimeType: string }[];
    audio?: { data: string; mimeType: string };
  }
): Promise<ReceiptResponse> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/receipts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to send receipt"
  );
}

export function fetchReceipts(
  ledgerId: string,
  params: {
    status?: string[];
    limit?: number;
    cursor?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<PaginatedResponse<Receipt>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status.join(","));
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.startDate) searchParams.set("startDate", params.startDate);
  if (params.endDate) searchParams.set("endDate", params.endDate);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/receipts?${searchParams}`,
    undefined,
    "Failed to fetch receipts"
  );
}

export function retryReceipt(
  ledgerId: string,
  receiptId: string
): Promise<{ success: boolean; message: string }> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/receipts/${receiptId}/retry`,
    {
      method: "POST",
    },
    "Failed to retry receipt"
  );
}

export function deleteReceipt(
  ledgerId: string,
  receiptId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/receipts/${receiptId}`,
    {
      method: "DELETE",
    },
    "Failed to delete receipt"
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

// GPT Tasks
export interface GptTask {
  id: string;
  type: string;
  title: string;
  ledgerId: string | null;
  entityId: string | null;
  entityType: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function fetchGptTasks(
  ledgerId: string,
  params: { activeOnly?: boolean; limit?: number } = {}
): Promise<GptTask[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("ledgerId", ledgerId);
  if (params.activeOnly) searchParams.set("activeOnly", "true");
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return request(
    `${API_BASE}/gpt/tasks?${searchParams}`,
    undefined,
    "Failed to fetch GPT tasks"
  );
}

