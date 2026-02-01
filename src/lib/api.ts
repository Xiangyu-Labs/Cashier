
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
// function createLedger removed

// LedgerEntry API
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

// function fetchLedgerEntries removed

// function fetchLedgerEntrySummary removed
// function fetchLedgerEntries removed

// function fetchSourceDocuments removed

// ProcessingTasks API
// ProcessingTasks API removed (migrated to actions)


// Share API
// Share API functions removed (migrated to actions)
