import type {
  EntryCategoryDto,
  LedgerDto,
  LedgerEntryDto,
  ServiceCredentialDto,
} from "@/modules/ledger/contracts";
import type {
  SourceDocumentDto,
  SourceDocumentGroupDto,
  SourceDocumentLightDto,
} from "@/modules/source-document/contracts";

export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type SerializedLedgerEntry = LedgerEntryDto;
export type SerializedEntryCategory = EntryCategoryDto;
export type SerializedLedger = LedgerDto;
export type SerializedServiceCredential = ServiceCredentialDto;
export type SerializedSourceDocument = SourceDocumentDto;
export type SerializedSourceDocumentLight = SourceDocumentLightDto;
export type SourceDocumentGroup = SourceDocumentGroupDto;

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
