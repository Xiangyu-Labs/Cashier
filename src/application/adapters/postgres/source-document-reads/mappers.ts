import type {
  SourceDocumentDto,
  SourceDocumentStoredFileDto,
  SourceDocumentListItemDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentLedgerEntryDto,
} from "@/modules/source-document/contracts";
import {
  PROCESSING_FAILURE_CODES,
  supportedSourceDocumentActions,
  type ApplicationErrorCode,
  type ProcessingFailureCode,
  type RevisionOutcome,
} from "@/application/contracts";
import { compare as decimalCompare, round as decimalRound } from "@/lib/money/decimal";
import type {
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
} from "@/modules/source-document/types";

export interface SourceDocumentRow {
  id: string;
  ledgerId: string;
  title: string | null;
  currentStatus: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  entryDate: string | null;
  effectiveDate: string;
  activeRevisionId: string | null;
  pendingRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface DuplicateReviewRow {
  sourceDocumentId: string;
  revisionId: string;
  matchedSourceDocumentId: string;
  matchedRevisionId: string | null;
  status: "pending" | "kept" | "discarded" | "staged";
  reason: string | null;
  confidence: string | number | null;
}

export interface SourceDocumentHydrationRow {
  documentId: string;
  revisionTitle: string | null;
  submittedText: string | null;
  revisionOutcome: string | null;
  anomalyReason: string | null;
  failureCode: string | null;
  hasImages: boolean;
  files: SourceDocumentStoredFileAggregateRow[];
  ledgerEntries: SourceDocumentLedgerEntryAggregateRow[];
  activeResultSummary: SourceDocumentCandidateProjectionSummary | null;
  duplicateSourceDocumentId: string | null;
  duplicateRevisionId: string | null;
  duplicateMatchedSourceDocumentId: string | null;
  duplicateMatchedRevisionId: string | null;
  duplicateStatus: "pending" | "kept" | "discarded" | "staged" | null;
  duplicateReason: string | null;
  duplicateConfidence: string | number | null;
}

export interface SourceDocumentStoredFileAggregateRow {
  id: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
}

interface SourceDocumentEntryCategoryAggregateRow {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SourceDocumentLedgerEntryAggregateRow {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string;
  amount: string;
  currency: string;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category: SourceDocumentEntryCategoryAggregateRow | null;
}

export function mapDuplicateReviewDto(
  review: DuplicateReviewRow
): SourceDocumentDuplicateReviewDto {
  if (review.status === "staged") {
    throw new Error("Staged duplicate reviews are not client-visible");
  }
  return {
    sourceDocumentId: review.sourceDocumentId,
    revisionId: review.revisionId,
    matchedSourceDocumentId: review.matchedSourceDocumentId,
    matchedRevisionId: review.matchedRevisionId,
    status: review.status,
    reason: review.reason,
    confidence: review.confidence == null ? null : Number(review.confidence),
  };
}

export function mapStoredFileDto(file: {
  id: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
}): SourceDocumentStoredFileDto {
  return {
    id: file.id,
    contentType: file.contentType,
    byteSize: file.byteSize,
    originalFilename: file.originalFilename,
  };
}

function mapLedgerEntryAggregateDto(
  entry: SourceDocumentLedgerEntryAggregateRow
): SourceDocumentLedgerEntryDto {
  return {
    id: entry.id,
    ledgerId: entry.ledgerId,
    categoryId: entry.categoryId,
    sourceDocumentId: entry.sourceDocumentId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate:
      entry.exchangeRate != null && decimalCompare(entry.exchangeRate, "1") === 0
        ? "1"
        : entry.exchangeRate,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    ...(entry.category == null ? {} : { category: entry.category }),
  };
}

export function mapDuplicateReviewEntryDto(
  entry: {
    id: string;
    itemName: string;
    description: string | null;
    amount: string;
    currency: string | null;
    convertedAmount: string | null;
  },
  ledgerId: string
): SourceDocumentLedgerEntryDto {
  return {
    id: entry.id,
    ledgerId,
    categoryId: null,
    sourceDocumentId: null,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate: null,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  };
}

export function effectiveDocumentTitle(
  documentTitle: string | null | undefined,
  revisionTitle: string | null | undefined
): string | null {
  for (const value of [documentTitle, revisionTitle]) {
    const normalized = value?.trim();
    if (normalized != null && normalized !== "") return normalized;
  }
  return null;
}

export function mapListItem(
  row: SourceDocumentRow,
  hydration: SourceDocumentHydrationRow
): SourceDocumentListItemDto {
  const item: SourceDocumentListItemDto = {
    id: row.id,
    ledgerId: row.ledgerId,
    title: effectiveDocumentTitle(row.title, hydration.revisionTitle),
    text: null,
    status: row.currentStatus,
    type: row.type,
    anomalyReason: hydration.anomalyReason,
    entryDate: row.entryDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasImages: hydration.hasImages,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingRevisionId: row.pendingRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null
            ? null
            : ((hydration.revisionOutcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(hydration.revisionOutcome ?? undefined, hydration.failureCode),
    pendingRevisionId: row.pendingRevisionId,
  };
  const duplicateReview = duplicateReviewFromHydration(hydration);
  if (duplicateReview != null) item.duplicateReview = duplicateReview;
  return item;
}

function duplicateReviewFromHydration(
  hydration: SourceDocumentHydrationRow
): SourceDocumentDuplicateReviewDto | null {
  if (
    hydration.duplicateSourceDocumentId == null ||
    hydration.duplicateRevisionId == null ||
    hydration.duplicateMatchedSourceDocumentId == null ||
    hydration.duplicateStatus == null
  ) {
    return null;
  }
  return mapDuplicateReviewDto({
    sourceDocumentId: hydration.duplicateSourceDocumentId,
    revisionId: hydration.duplicateRevisionId,
    matchedSourceDocumentId: hydration.duplicateMatchedSourceDocumentId,
    matchedRevisionId: hydration.duplicateMatchedRevisionId,
    status: hydration.duplicateStatus,
    reason: hydration.duplicateReason,
    confidence: hydration.duplicateConfidence,
  });
}

export function mapSourceDocumentDetail(
  row: SourceDocumentRow,
  hydration: SourceDocumentHydrationRow
): SourceDocumentDto {
  const duplicateReview = duplicateReviewFromHydration(hydration);
  const activeResultSummary =
    hydration.activeResultSummary == null
      ? null
      : {
          entryCount: Number(hydration.activeResultSummary.entryCount),
          total: decimalRound(String(hydration.activeResultSummary.total), 2),
        };
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: effectiveDocumentTitle(row.title, hydration.revisionTitle),
    text: hydration.submittedText,
    files: hydration.files.map(mapStoredFileDto),
    ledgerEntries: hydration.ledgerEntries.map(mapLedgerEntryAggregateDto),
    status: row.currentStatus,
    type: row.type,
    anomalyReason: hydration.anomalyReason,
    entryDate: row.entryDate,
    metadata: {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: null,
    hasImages: hydration.hasImages,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingRevisionId: row.pendingRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null
            ? null
            : ((hydration.revisionOutcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(hydration.revisionOutcome ?? undefined, hydration.failureCode),
    pendingRevisionId: row.pendingRevisionId,
    activeRevisionId: row.activeRevisionId,
    ...(duplicateReview == null ? {} : { duplicateReview }),
    ...(activeResultSummary == null ? {} : { activeResultSummary }),
  };
}

function sanitizedErrorCode(
  outcome: string | undefined,
  failureCode: string | null | undefined
): ApplicationErrorCode | ProcessingFailureCode | null {
  if (outcome === "anomaly") return "VALIDATION_FAILED";
  if (outcome !== "failed") return null;
  const allowed: readonly ApplicationErrorCode[] = [
    "VALIDATION_FAILED",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "RATE_LIMITED",
    "PROCESSING_UNAVAILABLE",
    "STORAGE_UNAVAILABLE",
    "INTERNAL",
  ];
  if (allowed.includes(failureCode as ApplicationErrorCode)) {
    return failureCode as ApplicationErrorCode;
  }
  if (
    failureCode != null &&
    (PROCESSING_FAILURE_CODES as readonly string[]).includes(failureCode)
  ) {
    return failureCode as ProcessingFailureCode;
  }
  return "PROCESSING_UNAVAILABLE";
}
