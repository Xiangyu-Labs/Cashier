import type { z } from "zod";
import type {
  saveSourceDocumentChangesInputSchema,
  splitSourceDocumentInputSchema,
} from "./contract-schemas";

export { SourceDocumentStatus, SourceDocumentType } from "./types";
export type {
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
} from "./types";
export type {
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentCandidateReviewRevisionDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentDto,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentFullDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightDto,
  SourceDocumentLightWithEntriesDto,
  SourceDocumentListItemDto,
  SourceDocumentStoredFileDto,
  StreamPage,
  StreamTotalDto,
} from "./document-contracts";
export type {
  SourceDocumentDto as SourceDocument,
  SourceDocumentLightDto as SourceDocumentLight,
} from "./document-contracts";

export interface CreateSourceDocumentResponseDto {
  sourceDocumentId: string;
  version: 1;
  status: "processing";
}

export interface VersionedTarget {
  sourceDocumentId: string;
  expectedVersion: number;
}

export type VersionedCommandResult<T> =
  | { ok: true; sourceDocumentId: string; version: number; data: T }
  | {
      ok: false;
      reason: "stale";
      sourceDocumentId: string;
      expectedVersion: number;
      currentVersion: number;
    };

/**
 * Transaction semantics: one atomic transaction covers every target. If any
 * target's `stateVersion` no longer matches its `expectedVersion`, the whole
 * command rolls back with zero writes — `staleTargets` lists every mismatched
 * target, not just the first. On success, every target advanced together in
 * that same transaction.
 */
export type AtomicBatchCommandResult<T> =
  | { ok: true; versions: Array<{ sourceDocumentId: string; version: number }>; data: T }
  | {
      ok: false;
      reason: "stale";
      staleTargets: Array<{
        sourceDocumentId: string;
        expectedVersion: number;
        currentVersion: number;
      }>;
    };

/**
 * Transaction semantics: one transaction per document, not one for the whole
 * batch. Entries belonging to the same document either all succeed or all
 * roll back together (that document lands in exactly one of `succeeded`,
 * `stale`, or `failed`), but different documents commit independently — one
 * document's stale version or failure never blocks or rolls back another's.
 */
export interface PartialBatchCommandResult<TId extends string = string> {
  succeeded: Array<{ id: TId; sourceDocumentId: string; version: number }>;
  stale: Array<{
    id: TId;
    sourceDocumentId: string;
    expectedVersion: number;
    currentVersion: number;
  }>;
  failed: Array<{ id: TId; code: string }>;
}

export interface RetrySourceDocumentResponseDto {
  status: "processing";
}

export interface QuickEntryResponseDto {
  sourceDocumentId: string;
  ledgerEntryId: string;
  status: "completed";
}

export interface CreatedRecordResult {
  sourceDocumentId: string;
  entryDate: string;
}

export type SaveSourceDocumentChangesInput = z.infer<typeof saveSourceDocumentChangesInputSchema>;

export interface SaveSourceDocumentChangesResultDto {
  updatedEntryIds: string[];
}

export type SplitSourceDocumentInput = z.infer<typeof splitSourceDocumentInputSchema>;

export interface SplitSourceDocumentResultDto {
  splitSourceDocumentId: string;
  splitVersion: 1;
  movedEntryCount: number;
}

export interface BatchUpdateSourceDocumentsResultDto {
  sourceDocumentIds: string[];
  updatedCount: number;
}

export interface DeleteSourceDocumentResultDto {
  sourceDocumentId: string;
  deleted: boolean;
}

export interface AcceptCandidateResponseDto {
  status: "completed" | "duplicate_pending";
}

export interface AbandonCandidateResponseDto {
  status: "completed" | "duplicate_pending";
}

export interface CancelProcessingResponseDto {
  status: "cancelled" | "completed" | "duplicate_pending";
}
