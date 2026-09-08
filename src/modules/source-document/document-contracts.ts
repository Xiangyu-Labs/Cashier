import type { SourceDocumentStatusType, SourceDocumentTypeValue } from "./types";
import type { EntryCategoryDto, LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
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

export type SourceDocumentLedgerEntryDto = LedgerEntryEmbeddedViewDto;

interface SourceDocumentSummaryDto {
  id: string;
  version: number;
  ledgerId: string;
  title: string | null;
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  createdAt: string;
  updatedAt: string;
  supportedActions: SupportedSourceDocumentAction[];
  canEdit: boolean;
  errorCode: ApplicationErrorCode | ProcessingFailureCode | null;
}

interface SourceDocumentEvidenceDto {
  text: string | null;
  files: SourceDocumentStoredFileDto[];
}

export interface SourceDocumentDto extends SourceDocumentSummaryDto, SourceDocumentEvidenceDto {
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages?: boolean;
  activeResultSummary?: SourceDocumentCandidateProjectionSummary;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface SourceDocumentCandidateProjectionSummary {
  entryCount: number;
  total: string;
}

export interface SourceDocumentCandidateReviewEntryDto {
  id: string;
  itemName: string;
  description: string | null;
  category: EntryCategoryDto | null;
  amount: string;
  currency: string | null;
  convertedAmount: string | null;
}

export interface SourceDocumentCandidateReviewRevisionDto {
  entries: SourceDocumentCandidateReviewEntryDto[];
  entryCount: number;
  total: string;
}

export interface SourceDocumentCandidateReviewDto {
  sourceDocumentId: string;
  version: number;
  active: SourceDocumentCandidateReviewRevisionDto;
  candidate: SourceDocumentCandidateReviewRevisionDto;
}

export interface SourceDocumentDuplicateReviewDto {
  sourceDocumentId: string;
  matchedSourceDocumentId: string;
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
  version: number;
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

export interface SourceDocumentListItemDto extends SourceDocumentSummaryDto {
  text: null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages: boolean;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface SourceDocumentLightDto
  extends Omit<SourceDocumentSummaryDto, "updatedAt">, SourceDocumentEvidenceDto {
  hasImages: boolean;
  activeResultSummary?: SourceDocumentCandidateProjectionSummary;
  duplicateReview?: SourceDocumentDuplicateReviewDto;
}

export interface StreamPage {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
  generation: string;
  hasTransitionalWork: boolean;
  /** When true, indicates the cursor was invalid — the client should discard
   *  all cached pages and restart the stream from page one. */
  restartRequired?: boolean;
}

export interface StreamTotalDto {
  total: string;
  unconvertedCount: number;
}

export interface SourceDocumentFullDto extends SourceDocumentEvidenceDto {
  id: string;
  status: SourceDocumentStatusType;
  createdAt: string;
}

export interface SourceDocumentLightWithEntriesDto extends SourceDocumentLightDto {
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}
