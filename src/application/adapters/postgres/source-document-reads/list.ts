import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentDuplicateReviewDetailDto,
} from "@/modules/source-document/contracts";
import type { PendingDuplicateReviewContract } from "@/modules/source-document/application/ports";
import { supportedSourceDocumentActions, type RevisionOutcome } from "@/application/contracts";
import { add as decimalAdd } from "@/lib/money/decimal";
import {
  duplicateReviews,
  entryCategories,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { ConflictError, NotFoundError } from "@/lib/errors";

import type { TargetSourceDocumentListInput } from "./filters";
import { baseConditions } from "./filters";
import { cursorCondition, encodeCursor } from "./cursor";
import {
  effectiveDocumentTitle,
  mapDuplicateReviewDto,
  mapListItem,
  sanitizedErrorCode,
} from "./mappers";
import {
  hasRevisionFiles,
  loadActiveResultSummaryMap,
  loadDuplicateReviewMap,
  loadDuplicateReviewSide,
  loadFileData,
  loadRevisionFacts,
} from "./hydration";

export async function getTargetSourceDocumentAccessContext(sourceDocumentId: string) {
  const document = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)),
    columns: { ledgerId: true, activeRevisionId: true, pendingRevisionId: true },
  });
  if (document == null) return null;
  const revisionId = document.pendingRevisionId ?? document.activeRevisionId;
  const hasFiles = revisionId != null && (await hasRevisionFiles(document.ledgerId, revisionId));
  return { ledgerId: document.ledgerId, hasImages: hasFiles };
}

export async function listPendingDuplicateReviews(
  ledgerId: string,
  sourceDocumentIds: readonly string[]
): Promise<PendingDuplicateReviewContract[]> {
  if (sourceDocumentIds.length === 0) return [];

  const rows = await db
    .select({
      sourceDocumentId: duplicateReviews.sourceDocumentId,
      revisionId: duplicateReviews.revisionId,
    })
    .from(duplicateReviews)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.ledgerId, duplicateReviews.ledgerId),
        eq(sourceDocuments.id, duplicateReviews.sourceDocumentId),
        isNull(sourceDocuments.deletedAt),
        eq(sourceDocuments.currentStatus, "duplicate_pending")
      )
    )
    .where(
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.status, "pending"),
        inArray(duplicateReviews.sourceDocumentId, [...sourceDocumentIds])
      )
    );

  return rows;
}

export async function getSourceDocumentCandidateReview(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentCandidateReviewDto> {
  const document = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.ledgerId, ledgerId),
      eq(sourceDocuments.id, sourceDocumentId),
      isNull(sourceDocuments.deletedAt)
    ),
    columns: { activeRevisionId: true, pendingRevisionId: true },
  });
  if (document == null) throw new NotFoundError("Source document");
  if (document.activeRevisionId == null || document.pendingRevisionId == null) {
    throw new ConflictError("Source document has no candidate to review");
  }

  const revisionIds = [document.activeRevisionId, document.pendingRevisionId];
  const [revisions, rows] = await Promise.all([
    db
      .select({ id: sourceDocumentRevisions.id, outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
          inArray(sourceDocumentRevisions.id, revisionIds)
        )
      ),
    db
      .select({
        revisionId: ledgerEntries.sourceDocumentRevisionId,
        id: ledgerEntries.id,
        itemName: ledgerEntries.itemName,
        description: ledgerEntries.description,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        convertedAmount: ledgerEntries.convertedAmount,
        categoryId: entryCategories.id,
        categoryLedgerId: entryCategories.ledgerId,
        categoryName: entryCategories.name,
        categoryDescription: entryCategories.description,
        categoryIcon: entryCategories.icon,
        categorySortOrder: entryCategories.sortOrder,
        categoryCreatedAt: entryCategories.createdAt,
        categoryUpdatedAt: entryCategories.updatedAt,
        categoryDeletedAt: entryCategories.deletedAt,
      })
      .from(ledgerEntries)
      .leftJoin(
        entryCategories,
        and(
          eq(entryCategories.ledgerId, ledgerEntries.ledgerId),
          eq(entryCategories.id, ledgerEntries.categoryId)
        )
      )
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          inArray(ledgerEntries.sourceDocumentRevisionId, revisionIds),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(ledgerEntries.sourceDocumentRevisionId, ledgerEntries.position),
  ]);

  const pendingRevision = revisions.find((revision) => revision.id === document.pendingRevisionId);
  if (pendingRevision?.outcome !== "completed") {
    throw new ConflictError("Candidate revision is no longer available for review");
  }

  const entriesByRevision = new Map<string, SourceDocumentCandidateReviewEntryDto[]>();
  for (const row of rows) {
    if (row.revisionId == null) continue;
    const entries = entriesByRevision.get(row.revisionId) ?? [];
    entries.push({
      id: row.id,
      itemName: row.itemName,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      convertedAmount: row.convertedAmount,
      category:
        row.categoryId == null || row.categoryLedgerId == null || row.categoryName == null
          ? null
          : {
              id: row.categoryId,
              ledgerId: row.categoryLedgerId,
              name: row.categoryName,
              description: row.categoryDescription,
              icon: row.categoryIcon,
              sortOrder: row.categorySortOrder ?? 0,
              createdAt: row.categoryCreatedAt?.toISOString() ?? "",
              updatedAt: row.categoryUpdatedAt?.toISOString() ?? "",
              deletedAt: row.categoryDeletedAt?.toISOString() ?? null,
            },
    });
    entriesByRevision.set(row.revisionId, entries);
  }

  const buildRevision = (revisionId: string) => {
    const entries = entriesByRevision.get(revisionId) ?? [];
    const total = entries.reduce(
      (sum, entry) => decimalAdd(sum, entry.convertedAmount ?? entry.amount),
      "0"
    );
    return { revisionId, entries, entryCount: entries.length, total };
  };

  return {
    sourceDocumentId,
    active: buildRevision(document.activeRevisionId),
    candidate: buildRevision(document.pendingRevisionId),
  };
}

/**
 * Loads the side-by-side duplicate review payload: the review record, the
 * duplicate document's active review revision data, and the matched revision
 * snapshot captured at detection time. The matched side always renders the
 * snapshot, so a later edit or soft-delete of the matched bill never changes
 * the comparison evidence; `matchedState` reports what changed since.
 */
export async function getSourceDocumentDuplicateReview(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDuplicateReviewDetailDto> {
  const review = await db
    .select()
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
        eq(duplicateReviews.status, "pending")
      )
    )
    .then((rows) => rows[0]);
  if (review == null || review.status !== "pending") throw new NotFoundError("Duplicate review");

  const duplicateDoc = await db
    .select({
      id: sourceDocuments.id,
      title: sourceDocuments.title,
      entryDate: sourceDocuments.entryDate,
      createdAt: sourceDocuments.createdAt,
    })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .then((rows) => rows[0]);
  if (duplicateDoc == null) throw new NotFoundError("Source document");

  const duplicateSide = await loadDuplicateReviewSide(ledgerId, review.revisionId);
  // First-parsed documents start with a null title; the parsed title lives on
  // the pending revision until the document is kept.
  const duplicateRevision = await db
    .select({ title: sourceDocumentRevisions.title })
    .from(sourceDocumentRevisions)
    .where(
      and(
        eq(sourceDocumentRevisions.ledgerId, ledgerId),
        eq(sourceDocumentRevisions.id, review.revisionId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId)
      )
    )
    .then((rows) => rows[0]);
  // Current state of the matched bill (soft-deleted rows included). Only used
  // to derive `matchedState`; the comparison below always uses the snapshot.
  const matchedDoc = await db
    .select({
      id: sourceDocuments.id,
      activeRevisionId: sourceDocuments.activeRevisionId,
      deletedAt: sourceDocuments.deletedAt,
    })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, review.matchedSourceDocumentId)
      )
    )
    .then((rows) => rows[0]);
  const matchedState: SourceDocumentDuplicateReviewDetailDto["matchedState"] =
    matchedDoc == null || matchedDoc.deletedAt != null
      ? "deleted"
      : matchedDoc.activeRevisionId !== review.matchedRevisionId
        ? "modified"
        : "unchanged";

  // Legacy reviews may point at a matched bill with no surviving revision: the
  // snapshot was never recoverable, so the matched side is unavailable while
  // the review record itself stays readable.
  const matchedRevisionId = review.matchedRevisionId;
  const matchedCreatedAt = review.matchedCreatedAt;
  if (matchedRevisionId == null || matchedCreatedAt == null) {
    return {
      review: mapDuplicateReviewDto(review),
      duplicate: {
        id: duplicateDoc.id,
        title: effectiveDocumentTitle(duplicateDoc.title, duplicateRevision?.title),
        entryDate: duplicateDoc.entryDate,
        createdAt: duplicateDoc.createdAt.toISOString(),
        entries: duplicateSide.entries,
        files: duplicateSide.files,
      },
      matched: null,
      matchedState: "deleted",
    };
  }

  // Comparison content always loads from the revision captured at detection
  // time, never from the matched bill's current active revision. The
  // snapshot's entries stay readable even after the matched bill was edited
  // or soft-deleted (both soft-delete the old revision's ledger rows).
  const [side, matchedRevision] = await Promise.all([
    loadDuplicateReviewSide(ledgerId, matchedRevisionId, {
      includeDeletedEntries: true,
    }),
    db
      .select({ title: sourceDocumentRevisions.title })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, ledgerId),
          eq(sourceDocumentRevisions.id, matchedRevisionId),
          eq(sourceDocumentRevisions.sourceDocumentId, review.matchedSourceDocumentId)
        )
      )
      .then((rows) => rows[0]),
  ]);

  return {
    review: mapDuplicateReviewDto(review),
    duplicate: {
      id: duplicateDoc.id,
      title: effectiveDocumentTitle(duplicateDoc.title, duplicateRevision?.title),
      entryDate: duplicateDoc.entryDate,
      createdAt: duplicateDoc.createdAt.toISOString(),
      entries: duplicateSide.entries,
      files: duplicateSide.files,
    },
    matched: {
      id: review.matchedSourceDocumentId,
      title: effectiveDocumentTitle(review.matchedTitle, matchedRevision?.title),
      entryDate: review.matchedEntryDate,
      createdAt: matchedCreatedAt.toISOString(),
      entries: side.entries,
      files: side.files,
    },
    matchedState,
  };
}

async function fetchRows(input: TargetSourceDocumentListInput, includeCursor: boolean) {
  const conditions = baseConditions(input);
  if (includeCursor) {
    const cursor = cursorCondition(input.cursor);
    if (cursor != null) conditions.push(cursor);
  }
  return db
    .select()
    .from(sourceDocuments)
    .where(and(...conditions))
    .orderBy(
      desc(sourceDocuments.effectiveDate),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id)
    )
    .limit(input.limit + 1);
}

export async function listTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  const rows = await fetchRows(input, true);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const [revisions, fileData] = await Promise.all([
    loadRevisionFacts(pageRows),
    loadFileData(pageRows, false),
  ]);
  const duplicateReviewMap = await loadDuplicateReviewMap(pageRows);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => {
      const item = mapListItem(row, revisions, fileData.hasImages);
      const duplicateReview = duplicateReviewMap.get(row.id);
      if (duplicateReview !== undefined) {
        item.duplicateReview = duplicateReview;
      }
      return item;
    }),
    nextCursor: hasMore && last != null ? encodeCursor(last) : null,
  };
}

export async function getTargetSourceDocument(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDto | null> {
  const row = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.ledgerId, ledgerId),
      eq(sourceDocuments.id, sourceDocumentId),
      isNull(sourceDocuments.deletedAt)
    ),
  });
  if (row == null) return null;
  const [revisions, fileData] = await Promise.all([
    loadRevisionFacts([row]),
    loadFileData([row], true),
  ]);
  const duplicateReviewMap = await loadDuplicateReviewMap([row]);
  const selectedRevisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const selectedRevision =
    selectedRevisionId == null ? null : (revisions.get(selectedRevisionId) ?? null);
  const files = fileData.files.get(row.id) ?? [];
  const status = row.currentStatus;

  // Load active result summary for anomaly/failed documents with an active revision
  let activeResultSummary: SourceDocumentCandidateProjectionSummary | undefined;
  if ((status === "anomaly" || status === "failed") && row.activeRevisionId != null) {
    const summaryMap = await loadActiveResultSummaryMap([row]);
    activeResultSummary = summaryMap.get(row.id);
  }
  const duplicateReview = duplicateReviewMap.get(row.id);

  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: effectiveDocumentTitle(row.title, selectedRevision?.title),
    text: selectedRevision?.submittedText ?? null,
    files,
    status,
    type: row.type,
    anomalyReason: selectedRevision?.anomalyReason ?? null,
    entryDate: row.entryDate,
    metadata: {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: null,
    hasImages: files.length > 0,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingRevisionId: row.pendingRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null
            ? null
            : ((selectedRevision?.outcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(selectedRevision?.outcome, selectedRevision?.failureCode),
    pendingRevisionId: row.pendingRevisionId,
    activeRevisionId: row.activeRevisionId,
    ...(duplicateReview !== undefined ? { duplicateReview } : {}),
    ...(activeResultSummary !== undefined ? { activeResultSummary } : {}),
  };
}
