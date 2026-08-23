import type { SourceDocumentStatusType, SourceDocumentTypeValue } from "./types";
import type {
  ApplicationErrorCode,
  ProcessingFailureCode,
  SupportedSourceDocumentAction,
} from "@/application/contracts";

export interface SourceDocumentStoredFileDto {
  id: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
}

export type SourceDocumentEntryCategoryDto = {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SourceDocumentLedgerEntryDto = {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: SourceDocumentEntryCategoryDto | null;
};

export interface SourceDocumentDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages?: boolean;
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | ProcessingFailureCode | null;
  pendingRevisionId: string | null;
  activeRevisionId?: string | null;
  activeResultSummary?: SourceDocumentCandidateProjectionSummary;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface SourceDocumentCandidateProjectionSummary {
  entryCount: number;
  total: string;
}

export interface SourceDocumentCandidateComparisonDto {
  active: SourceDocumentCandidateProjectionSummary;
  candidate: SourceDocumentCandidateProjectionSummary;
  changed: boolean;
}

export interface SourceDocumentCandidateReviewEntryDto {
  id: string;
  itemName: string;
  description: string | null;
  category: SourceDocumentEntryCategoryDto | null;
  amount: string;
  currency: string | null;
  convertedAmount: string | null;
}

export interface SourceDocumentCandidateReviewRevisionDto {
  revisionId: string;
  entries: SourceDocumentCandidateReviewEntryDto[];
  entryCount: number;
  total: string;
}

export interface SourceDocumentCandidateReviewDto {
  sourceDocumentId: string;
  active: SourceDocumentCandidateReviewRevisionDto;
  candidate: SourceDocumentCandidateReviewRevisionDto;
}

export interface SourceDocumentDuplicateReviewDto {
  sourceDocumentId: string;
  revisionId: string;
  matchedSourceDocumentId: string;
  matchedRevisionId: string | null;
  status: "pending" | "kept" | "discarded";
  reason: string | null;
  confidence: number | null;
}

/**
 * Side-by-side review payload for a duplicate-pending document. The `matched`
 * side renders the revision snapshot captured at detection time, so a later
 * edit or soft-delete of the matched bill never changes the evidence. It is
 * null only for legacy reviews whose matched bill has no surviving revision.
 * `matchedState` describes what happened to the matched bill since detection.
 */
export interface SourceDocumentDuplicateReviewDetailDto {
  review: SourceDocumentDuplicateReviewDto;
  duplicate: {
    id: string;
    title: string | null;
    entryDate: string | null;
    createdAt: string;
    entries: SourceDocumentLedgerEntryDto[];
    files: SourceDocumentStoredFileDto[];
  };
  matched: {
    id: string;
    title: string | null;
    entryDate: string | null;
    createdAt: string;
    entries: SourceDocumentLedgerEntryDto[];
    files: SourceDocumentStoredFileDto[];
  } | null;
  matchedState: "unchanged" | "modified" | "deleted";
}

export interface SourceDocumentListItemDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, never>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages: boolean;
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | ProcessingFailureCode | null;
  pendingRevisionId: string | null;
  candidateComparison?: SourceDocumentCandidateComparisonDto;
  activeResultSummary?: SourceDocumentCandidateProjectionSummary;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface SourceDocumentLightDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  createdAt: string;
  hasImages: boolean;
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | ProcessingFailureCode | null;
  pendingRevisionId: string | null;
  activeRevisionId?: string | null;
  activeResultSummary?: SourceDocumentCandidateProjectionSummary;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface SourceDocumentGroupDto {
  sourceDocument: SourceDocumentListItemDto;
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}

export interface SourceDocumentPageDto {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
}

export interface StreamPage {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
  generation: string;
  /** When true, indicates the cursor was invalid — the client should discard
   *  all cached pages and restart the stream from page one. */
  restartRequired?: boolean;
}

export interface StreamTotalDto {
  total: string;
  unconvertedCount: number;
}

export interface SourceDocumentCollectionDto {
  items: SourceDocumentListItemDto[];
  hasMore: boolean;
  total: number;
}

export interface SourceDocumentAttentionDto {
  items: SourceDocumentListItemDto[];
  total: number;
}

export interface SourceDocumentCountsDto {
  processingCount: number;
  attentionCount: number;
}

export interface SourceDocumentCompletedPageDto {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
}

export interface SourceDocumentFullDto {
  id: string;
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  createdAt: string;
}

export interface SourceDocumentLightWithEntriesDto extends SourceDocumentLightDto {
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}
