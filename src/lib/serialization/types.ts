/**
 * Serialization Types
 *
 * Defines the serialized forms of database entities for client-server communication.
 * All Date objects are converted to ISO string format for JSON serialization.
 */

import type {
  LedgerEntry as DbLedgerEntry,
  EntryCategory as DbEntryCategory,
  Ledger as DbLedger,
} from "@/features/ledger/server/schema";
import type {
  SourceDocument as DbSourceDocument,
  SourceDocumentStatusType,
} from "@/features/source-document/server/schema";
import type { ServiceCredential as DbServiceCredential } from "@/features/ledger/server/schema";

// Helper type to convert Date to string recursively
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

// ============================================================================
// Ledger Module
// ============================================================================

export type SerializedLedgerEntry = Serialized<DbLedgerEntry> & {
  category?: SerializedEntryCategory | null;
  sourceDocument?: SerializedSourceDocumentLight | null;
};

export type SerializedEntryCategory = Serialized<DbEntryCategory>;

export type SerializedLedger = Serialized<DbLedger>;

export type SerializedServiceCredential = Serialized<DbServiceCredential>;

// ============================================================================
// Source Document Module
// ============================================================================

export type SerializedSourceDocument = Omit<Serialized<DbSourceDocument>, "status"> & {
  status: SourceDocumentStatusType;
  ledgerEntries?: SerializedLedgerEntry[];
  hasImages?: boolean;
};

// Light version without nested entries (for list views)
export type SerializedSourceDocumentLight = Omit<Serialized<DbSourceDocument>, "status"> & {
  status: SourceDocumentStatusType;
  hasImages?: boolean;
};

// Source document with grouped entries (pending queue view)
export interface SourceDocumentGroup {
  sourceDocument: SerializedSourceDocument;
  ledgerEntries: SerializedLedgerEntry[];
}

// ============================================================================
// Task Queue Module
// ============================================================================

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface SerializedTask {
  id: string;
  type: string;
  title: string;
  status: TaskStatus;
  input: unknown | null;
  deduplicationKey: string | null;
  scopeId: string | null;
  entityType: string | null;
  entityId: string | null;
  error: string | null;
  progress: string | null;
  tokenUsage: { [model: string]: { input: number; output: number } } | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
