import type { z } from "zod";
import type { SourceDocumentDto } from "./document-contracts";
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
  SourceDocumentCandidateComparisonDto,
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

export type SaveSourceDocumentChangesInput = z.infer<typeof saveSourceDocumentChangesInputSchema>;

export interface SaveSourceDocumentChangesResultDto {
  activeRevisionId: string;
  sourceDocument: SourceDocumentDto;
}

export type SplitSourceDocumentInput = z.infer<typeof splitSourceDocumentInputSchema>;

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
