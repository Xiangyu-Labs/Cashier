import type {
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
import { add as decimalAdd, round as decimalRound } from "@/lib/money/decimal";
import type { duplicateReviews, sourceDocumentRevisions, sourceDocuments } from "@/persistence";

export type SourceDocumentRow = typeof sourceDocuments.$inferSelect;
type SourceDocumentRevisionRow = typeof sourceDocumentRevisions.$inferSelect;
type DuplicateReviewRow = typeof duplicateReviews.$inferSelect;

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
  revisions: ReadonlyMap<string, SourceDocumentRevisionRow>,
  hasImages: ReadonlyMap<string, boolean>
): SourceDocumentListItemDto {
  const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const revision = revisionId == null ? null : revisions.get(revisionId);
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: effectiveDocumentTitle(row.title, revision?.title),
    text: null,
    status: row.currentStatus,
    type: row.type,
    anomalyReason: revision?.anomalyReason ?? null,
    entryDate: row.entryDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasImages: hasImages.get(row.id) ?? false,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingRevisionId: row.pendingRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null ? null : ((revision?.outcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(revision?.outcome, revision?.failureCode),
    pendingRevisionId: row.pendingRevisionId,
  };
}

export function summarizeProjection(
  entries: Array<{
    amount: string;
    currency: string | null;
    convertedAmount: string | null;
  }>
): SourceDocumentCandidateProjectionSummary {
  const total = entries.reduce(
    (sum, entry) => decimalAdd(sum, entry.convertedAmount ?? entry.amount),
    "0"
  );
  return {
    entryCount: entries.length,
    total: decimalRound(total, 2),
  };
}

export function sanitizedErrorCode(
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
