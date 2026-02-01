import {
  Ledger,
  LedgerEntry,
  EntryCategory,
  SourceDocument,
  LedgerEntrySummary,
  ShareData,
} from "@/types/api";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

/**
 * Request helper for client-side API calls.
 * @deprecated Most logic should use Server Actions. 
 * This remains for specific cases like SSE or legacy endpoints if needed.
 */
async function request<T>(
  url: string,
  config?: RequestInit,
  errorMessage = "Something went wrong"
): Promise<T> {
  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;

  const res = await fetch(finalUrl, config);

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(error.message || errorMessage, res.status);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}
