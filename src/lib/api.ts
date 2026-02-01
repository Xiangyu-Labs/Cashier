
import {
  Ledger,
  LedgerEntry,
  EntryCategory,
  SourceDocument,
  LedgerEntrySummary,
  ShareData,
} from "@/types/api";

const API_BASE = "/api";
// Note: We use relative path /api which works for Client Components.
// For Server Components/Actions, we should use direct DB calls or internal URL if unavoidable.
// But this file seems mostly used by Client Components (Legacy).

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  config?: RequestInit,
  errorMessage = "Something went wrong"
): Promise<T> {
  // Ensure we don't double slash if url starts with / and API_BASE has /
  // API_BASE is /api.
  // If url is /ledgers, final is /api/ledgers.
  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;

  const res = await fetch(finalUrl, config);

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(error.message || errorMessage, res.status);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

// Ledgers
export function createLedger(data: {
  name: string;
  aiLanguage: string;
  currencies: string[];
  mainCurrency: string;
  autoRecognizeDate: boolean;
  collapseProcessingDefault: boolean;
  mergeSimilarItems: boolean;
  collapseBillsDefault: boolean;
  aiCustomPrompt: string;
}): Promise<Ledger> {
  return request(
    `/ledgers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Failed to create ledger"
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
    limit?: number;
    offset?: number;
    cursor?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<PaginatedResponse<LedgerEntry>> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);

  return request(
    `/ledgers/${ledgerId}/ledger-entries?${searchParams}`,
    undefined,
    "Failed to fetch ledger entries"
  );
}

export function fetchLedgerEntrySummary(ledgerId: string): Promise<LedgerEntrySummary> {
  return request(`/ledgers/${ledgerId}/summary`, undefined, "Failed to fetch summary");
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
    `/ledgers/${ledgerId}/source-documents?${searchParams}`,
    undefined,
    "Failed to fetch source documents"
  );
}

// ProcessingTasks API
export interface ProcessingTask {
  id: string;
  type: string;
  title: string;
  ledgerId: string | null;

  status: "running" | "completed" | "failed";
  error: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
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
    `/processing-tasks?${searchParams}`,
    undefined,
    "Failed to fetch processing tasks"
  );
}


// Share API
export function createShare(
  ledgerId: string,
  sourceDocumentId: string,
  expiresIn: "1d" | "7d" | "30d" | "never" = "7d"
): Promise<{ id: string; shareUrl: string; expiresAt: string | null }> {
  return request(
    `/ledgers/${ledgerId}/source-documents/${sourceDocumentId}/shares`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    },
    "Failed to create share link"
  );
}

export function deleteShare(
  ledgerId: string,
  sourceDocumentId: string,
  shareId: string
): Promise<void> {
  return request(
    `/ledgers/${ledgerId}/source-documents/${sourceDocumentId}/shares/${shareId}`,
    {
      method: "DELETE",
    },
    "Failed to delete share link"
  );
}

export function fetchShareData(shareId: string): Promise<ShareData> {
  return request(`/s/${shareId}`, undefined, "Failed to fetch share data");
}
