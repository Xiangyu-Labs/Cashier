import type {
  SourceDocumentDto,
  SourceDocumentGroupDto,
  SourceDocumentListItemDto,
} from "./document-contracts";

export { SourceDocumentStatus, SourceDocumentType } from "./types";
export type {
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
  EntryEditData,
} from "./types";
export type {
  SourceDocumentAttentionDto,
  SourceDocumentCandidateComparisonDto,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentCandidateReviewRevisionDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentCompletedPageDto,
  SourceDocumentCountsDto,
  SourceDocumentDto,
  SourceDocumentEntryCategoryDto,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentFullDto,
  SourceDocumentGroupDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightDto,
  SourceDocumentLightWithEntriesDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
  SourceDocumentStoredFileDto,
  StreamPage,
  StreamTotalDto,
} from "./document-contracts";
export type {
  SourceDocumentDto as SourceDocument,
  SourceDocumentLightDto as SourceDocumentLight,
} from "./document-contracts";

export interface CreateSourceDocumentInput {
  text?: string;
  storedFileIds?: string[];
  images?: { data: string; mimeType: string }[];
  originalImages?: { data: string; mimeType: string }[];
  entryDate?: string;
  timezone?: string;
}

export interface CreateSourceDocumentResponseDto {
  sourceDocumentId: string;
  revisionId: string;
  revisionState: "processing";
}

export interface RetrySourceDocumentResponseDto {
  sourceDocumentId: string;
  previousSourceDocumentId: string;
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

export interface PendingSourceDocumentsResponseDto {
  groups: {
    processing: SourceDocumentGroupDto[];
    duplicate_pending: SourceDocumentGroupDto[];
    anomaly: SourceDocumentGroupDto[];
    failed: SourceDocumentGroupDto[];
    cancelled: SourceDocumentGroupDto[];
  };
  stats: {
    processingCount: number;
    duplicatePendingCount: number;
    anomalyCount: number;
    failedCount: number;
    cancelledCount: number;
    total: number;
  };
}

export interface UpdateSourceDocumentResultDto {
  sourceDocumentId: string;
  updated: boolean;
}

export interface SaveSourceDocumentChangesInput {
  sourceDocumentId: string;
  expectedRevisionId: string;
  operationId: string;
  sourceDocument?: import("./contract-schemas").UpdateSourceDocumentInput;
  entries: Array<{
    ledgerEntryId: string;
    data: import("@/modules/ledger/contract-schemas").UpdateLedgerEntryInput;
  }>;
}

export interface SaveSourceDocumentChangesResultDto {
  activeRevisionId: string;
  sourceDocument: SourceDocumentDto;
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
  sourceDocumentId: string;
  revisionId: string;
  status: "completed" | "duplicate_pending";
}

export interface AbandonCandidateResponseDto {
  sourceDocumentId: string;
  revisionId: string;
  status: "abandoned";
}

export interface CancelProcessingResponseDto {
  sourceDocumentId: string;
  revisionId: string;
  status: "cancelled" | "abandoned";
  restoredActiveResult: boolean;
}

// ---------------------------------------------------------------------------
// Reconciliation DTOs for optimistic transactions
// ---------------------------------------------------------------------------

/**
 * Internal reconciliation DTO returned by server actions alongside existing
 * response data. Used by the optimistic transaction system to reconcile
 * client-side cache with authoritative server state.
 */
export interface MutationReconciliation<T> {
  /** The operation ID that was acknowledged by the server. */
  operationId: string;
  /** Client-submission ID for create operations (for dedup with polling). */
  clientSubmissionId?: string;
  /** The canonical entity, or null for tombstones (deletes). */
  entity: T | null;
  /** Entity version string (updatedAt timestamp) for stale-response detection. */
  entityVersion: string;
  /** Optional count delta for processing/attention transitions. */
  countPatch: { processingDelta: number; attentionDelta: number } | null;
  /** Whether the entity entered or left the current filter window. */
  streamMembershipChanged: boolean;
  /** Whether the entity's ordering position changed. */
  orderingChanged: boolean;
}

/**
 * Result type for create source document action with reconciliation data.
 */
export interface CreateSourceDocumentReconciliationDto {
  sourceDocumentId: string;
  revisionId: string;
  revisionState: "processing";
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

/**
 * Result type for retry source document action with reconciliation data.
 */
export interface RetrySourceDocumentReconciliationDto {
  sourceDocumentId: string;
  previousSourceDocumentId: string;
  status: "processing";
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

/**
 * Result type for update source document action with reconciliation data.
 */
export interface UpdateSourceDocumentReconciliationDto {
  sourceDocumentId: string;
  updated: boolean;
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

/**
 * Result type for delete source document action with reconciliation data.
 */
export interface DeleteSourceDocumentReconciliationDto {
  sourceDocumentId: string;
  deleted: boolean;
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

/**
 * Result type for accept candidate action with reconciliation data.
 */
export interface AcceptCandidateReconciliationDto {
  sourceDocumentId: string;
  revisionId: string;
  status: "completed" | "duplicate_pending";
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

/**
 * Result type for abandon candidate action with reconciliation data.
 */
export interface AbandonCandidateReconciliationDto {
  sourceDocumentId: string;
  revisionId: string;
  status: "abandoned";
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}

export interface CancelProcessingReconciliationDto extends CancelProcessingResponseDto {
  reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
}
