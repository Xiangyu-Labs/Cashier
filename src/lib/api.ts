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
