import {
  Ledger,
  EntryCategory,
  LedgerEntry,
  LedgerEntrySummary,
  SourceDocumentResponse,
  SourceDocument,
} from "@/types/api";

const API_BASE = "/api";

async function request<T>(
  url: string,
  options?: RequestInit,
  errorMessage = "Request failed"
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(errorMessage);
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

export function createLedger(data: { name: string; language?: string }): Promise<Ledger> {
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

// EntryCategory API
const GLOBAL_ID = "global";

export function fetchEntryCategories(ledgerId: string = GLOBAL_ID): Promise<EntryCategory[]> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/entry-categories`,
    undefined,
    "Failed to fetch categories"
  );
}

export function createEntryCategory(
  ledgerId: string = GLOBAL_ID,
  data: { name: string; description?: string; icon?: string }
): Promise<EntryCategory> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/entry-categories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create category"
  );
}

export function updateEntryCategory(
  ledgerId: string = GLOBAL_ID,
  categoryId: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  }
): Promise<EntryCategory> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/entry-categories/${categoryId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update category"
  );
}

export function deleteEntryCategory(
  ledgerId: string = GLOBAL_ID,
  categoryId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/entry-categories/${categoryId}`,
    {
      method: "DELETE",
    },
    "Failed to delete category"
  );
}

export function reorderEntryCategories(
  ledgerId: string = GLOBAL_ID,
  categoryIds: string[]
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/entry-categories/reorder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryIds }),
    },
    "Failed to reorder categories"
  );
}

// LedgerEntry API
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

export function fetchLedgerEntries(
  ledgerId: string,
  params?: {
    status?: "pending" | "confirmed";
    limit?: number;
    offset?: number;
    cursor?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<PaginatedResponse<LedgerEntry>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/ledger-entries?${searchParams}`,
    undefined,
    "Failed to fetch ledger entries"
  );
}

export function updateLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string,
  data: {
    categoryId?: string | null;
    amount?: number;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
    entryDate?: string | null;
    status?: "pending" | "confirmed";
  }
): Promise<LedgerEntry> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/ledger-entries/${ledgerEntryId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to update ledger entry"
  );
}

export function deleteLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/ledger-entries/${ledgerEntryId}`,
    {
      method: "DELETE",
    },
    "Failed to delete ledger entry"
  );
}

export function confirmLedgerEntries(
  ledgerId: string,
  data: { ledgerEntryIds?: string[]; confirmAll?: boolean }
): Promise<{ success: boolean; updatedCount: number }> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/ledger-entries/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to confirm ledger entries"
  );
}

export function fetchLedgerEntrySummary(
  ledgerId: string,
  status?: "pending" | "confirmed",
  startDate?: string,
  endDate?: string
): Promise<LedgerEntrySummary> {
  const searchParams = new URLSearchParams();
  if (status) searchParams.set("status", status);
  if (startDate) searchParams.set("startDate", startDate);
  if (endDate) searchParams.set("endDate", endDate);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/ledger-entries/summary?${searchParams}`,
    undefined,
    "Failed to fetch summary"
  );
}

// SourceDocument API
export function createSourceDocument(
  ledgerId: string,
  data: {
    text?: string;
    images?: { data: string; mimeType: string }[];
    audio?: { data: string; mimeType: string };
  }
): Promise<SourceDocumentResponse> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/source-documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to send source document"
  );
}

export function fetchSourceDocuments(
  ledgerId: string,
  params: {
    status?: string[];
    limit?: number;
    cursor?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<PaginatedResponse<SourceDocument>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status.join(","));
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.startDate) searchParams.set("startDate", params.startDate);
  if (params.endDate) searchParams.set("endDate", params.endDate);

  return request(
    `${API_BASE}/ledgers/${ledgerId}/source-documents?${searchParams}`,
    undefined,
    "Failed to fetch source documents"
  );
}

export function retrySourceDocument(
  ledgerId: string,
  sourceDocumentId: string
): Promise<{ success: boolean; message: string }> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/source-documents/${sourceDocumentId}/retry`,
    {
      method: "POST",
    },
    "Failed to retry source document"
  );
}

export function deleteSourceDocument(
  ledgerId: string,
  sourceDocumentId: string
): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/source-documents/${sourceDocumentId}`,
    {
      method: "DELETE",
    },
    "Failed to delete source document"
  );
}

// ServiceCredentials API
export interface ServiceCredential {
  id: string;
  name: string;
  key?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export function fetchServiceCredentials(ledgerId: string): Promise<ServiceCredential[]> {
  return request(`${API_BASE}/ledgers/${ledgerId}/service-credentials`, undefined, "Failed to fetch service credentials");
}

export function createServiceCredential(ledgerId: string, name: string): Promise<ServiceCredential> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/service-credentials`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "Failed to create service credential"
  );
}

export function deleteServiceCredential(ledgerId: string, credentialId: string): Promise<void> {
  return request(
    `${API_BASE}/ledgers/${ledgerId}/service-credentials/${credentialId}`,
    {
      method: "DELETE",
    },
    "Failed to delete service credential"
  );
}

// ProcessingTasks API
export interface ProcessingTask {
  id: string;
  type: string;
  title: string;
  ledgerId: string | null;
  entityId: string | null;
  entityType: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function fetchProcessingTasks(
  ledgerId: string,
  params: { activeOnly?: boolean; limit?: number } = {}
): Promise<ProcessingTask[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("ledgerId", ledgerId);
  if (params.activeOnly) searchParams.set("activeOnly", "true");
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return request(
    `${API_BASE}/processing-tasks?${searchParams}`,
    undefined,
    "Failed to fetch processing tasks"
  );
}

