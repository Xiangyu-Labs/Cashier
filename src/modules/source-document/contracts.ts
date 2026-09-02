import type { SourceDocumentDto, SourceDocumentGroupDto } from "./document-contracts";

export { SourceDocumentStatus, SourceDocumentType } from "./types";
export type {
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
} from "./types";
export type {
  SourceDocumentAttentionDto,
  SourceDocumentCandidateComparisonDto,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentCandidateReviewRevisionDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentCountsDto,
  SourceDocumentDto,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentFullDto,
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
    candidate_pending: SourceDocumentGroupDto[];
    duplicate_pending: SourceDocumentGroupDto[];
    anomaly: SourceDocumentGroupDto[];
    failed: SourceDocumentGroupDto[];
    cancelled: SourceDocumentGroupDto[];
  };
  stats: {
    processingCount: number;
    candidatePendingCount: number;
    duplicatePendingCount: number;
    anomalyCount: number;
    failedCount: number;
    cancelledCount: number;
    total: number;
  };
  nextCursor: string | null;
  hasMore: boolean;
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

export interface SplitSourceDocumentInput {
  sourceDocumentId: string;
  expectedRevisionId: string;
  operationId: string;
  newSourceDocumentId: string;
  ledgerEntryIds: string[];
  entryDate: string;
}

export interface SplitSourceDocumentResultDto {
  sourceDocumentId: string;
  sourceDocumentActiveRevisionId: string;
  splitSourceDocumentId: string;
  splitSourceDocumentActiveRevisionId: string;
  movedEntryCount: number;
  sourceDocument: SourceDocumentDto;
  splitSourceDocument: SourceDocumentDto;
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
