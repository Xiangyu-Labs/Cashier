import {
  Ledger,
  Category,
  Transaction,
  TransactionSummary,
  MessageResponse,
  InputMessage,
} from "@/types/api";

const API_BASE = "/api";

// Ledger API
export async function fetchLedgers(): Promise<Ledger[]> {
  const res = await fetch(`${API_BASE}/ledgers`);
  if (!res.ok) throw new Error("Failed to fetch ledgers");
  return res.json();
}

export async function fetchLedger(id: string): Promise<Ledger> {
  const res = await fetch(`${API_BASE}/ledgers/${id}`);
  if (!res.ok) throw new Error("Failed to fetch ledger");
  return res.json();
}

export async function createLedger(data: {
  name: string;
  language?: string;
}): Promise<Ledger> {
  const res = await fetch(`${API_BASE}/ledgers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create ledger");
  return res.json();
}

export async function updateLedger(
  id: string,
  data: { name?: string; language?: string }
): Promise<Ledger> {
  const res = await fetch(`${API_BASE}/ledgers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update ledger");
  return res.json();
}

export async function deleteLedger(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/ledgers/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete ledger");
}

// Category API
export async function fetchCategories(ledgerId: string): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/ledgers/${ledgerId}/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function createCategory(
  ledgerId: string,
  data: { name: string; description?: string; icon?: string }
): Promise<Category> {
  const res = await fetch(`${API_BASE}/ledgers/${ledgerId}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create category");
  return res.json();
}

export async function updateCategory(
  ledgerId: string,
  categoryId: string,
  data: { name?: string; description?: string; icon?: string; sortOrder?: number }
): Promise<Category> {
  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/categories/${categoryId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error("Failed to update category");
  return res.json();
}

export async function deleteCategory(
  ledgerId: string,
  categoryId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/categories/${categoryId}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) throw new Error("Failed to delete category");
}

// Transaction API
export async function fetchTransactions(
  ledgerId: string,
  params?: { status?: "pending" | "confirmed"; limit?: number; offset?: number }
): Promise<Transaction[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/transactions?${searchParams}`
  );
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function updateTransaction(
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
  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/transactions/${transactionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error("Failed to update transaction");
  return res.json();
}

export async function deleteTransaction(
  ledgerId: string,
  transactionId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/transactions/${transactionId}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) throw new Error("Failed to delete transaction");
}

export async function confirmTransactions(
  ledgerId: string,
  data: { transactionIds?: string[]; confirmAll?: boolean }
): Promise<{ success: boolean; updatedCount: number }> {
  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/transactions/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error("Failed to confirm transactions");
  return res.json();
}

export async function fetchTransactionSummary(
  ledgerId: string,
  status?: "pending" | "confirmed"
): Promise<TransactionSummary> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);

  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/transactions/summary?${searchParams}`
  );
  if (!res.ok) throw new Error("Failed to fetch summary");
  return res.json();
}

// Message API
export async function sendMessage(
  ledgerId: string,
  data: {
    text?: string;
    images?: { data: string; mimeType: string }[];
    audio?: { data: string; mimeType: string };
  }
): Promise<MessageResponse> {
  const res = await fetch(`${API_BASE}/ledgers/${ledgerId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

export async function fetchInputMessages(
  ledgerId: string,
  status?: string[]
): Promise<InputMessage[]> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status.join(","));

  const res = await fetch(
    `${API_BASE}/ledgers/${ledgerId}/messages?${searchParams}`
  );
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}
