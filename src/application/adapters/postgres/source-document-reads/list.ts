import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentDto,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentStoredFileDto,
} from "@/modules/source-document/contracts";
import type { PendingDuplicateReviewContract } from "@/modules/source-document/application/ports";
import { add as decimalAdd } from "@/lib/money/decimal";
import {
  duplicateReviews,
  entryCategories,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { ConflictError, NotFoundError } from "@/lib/errors";

import type { TargetSourceDocumentListInput } from "./filters";
import { baseConditions } from "./filters";
import { cursorCondition, encodeCursor } from "./cursor";
import {
  effectiveDocumentTitle,
  mapDuplicateReviewDto,
  mapListItem,
  mapSourceDocumentDetail,
  type SourceDocumentHydrationRow,
  type SourceDocumentRow,
} from "./mappers";
import { loadDuplicateReviewSide } from "./hydration";

type QueryExecutor = Pick<typeof db, "select">;

const selectedRevisionId = sql<string>`COALESCE(${sourceDocuments.pendingRevisionId}, ${sourceDocuments.activeRevisionId})`;

const hasSelectedRevisionFiles = (
  ledgerId: string | typeof sourceDocuments.ledgerId
) => sql<boolean>`EXISTS (
  SELECT 1
  FROM ${sourceDocumentRevisions} selected_revision
  INNER JOIN ${revisionFiles} selected_revision_file
    ON selected_revision_file.ledger_id = selected_revision.ledger_id
   AND selected_revision_file.revision_id = selected_revision.id
  INNER JOIN ${storedFiles} selected_file
    ON selected_file.ledger_id = selected_revision_file.ledger_id
   AND selected_file.id = selected_revision_file.stored_file_id
   AND selected_file.deleted_at IS NULL
  WHERE selected_revision.ledger_id = ${ledgerId}
    AND selected_revision.source_document_id = ${sourceDocuments.id}
    AND selected_revision.id = ${selectedRevisionId}
)`;

export async function getTargetSourceDocumentAccessContext(sourceDocumentId: string) {
  const document = await db
    .select({
      ledgerId: sourceDocuments.ledgerId,
      hasImages: hasSelectedRevisionFiles(sourceDocuments.ledgerId),
    })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)))
    .limit(1)
    .then((rows) => rows[0]);
  if (document == null) return null;
  return { ledgerId: document.ledgerId, hasImages: document.hasImages };
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

async function fetchRows(
  executor: QueryExecutor,
  input: TargetSourceDocumentListInput,
  includeCursor: boolean
) {
  const conditions = baseConditions(input);
  if (includeCursor) {
    const cursor = cursorCondition(input.cursor);
    if (cursor != null) conditions.push(cursor);
  }
  return executor
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

function duplicateReviewColumns() {
  return {
    duplicateSourceDocumentId: duplicateReviews.sourceDocumentId,
    duplicateRevisionId: duplicateReviews.revisionId,
    duplicateMatchedSourceDocumentId: duplicateReviews.matchedSourceDocumentId,
    duplicateMatchedRevisionId: duplicateReviews.matchedRevisionId,
    duplicateStatus: duplicateReviews.status,
    duplicateReason: duplicateReviews.reason,
    duplicateConfidence: duplicateReviews.confidence,
  };
}

async function hydrateSourceDocumentRows(
  executor: QueryExecutor,
  ledgerId: string,
  documentIds: readonly string[],
  includeDetail: boolean
): Promise<SourceDocumentHydrationRow[]> {
  if (documentIds.length === 0) return [];
  const files = includeDetail
    ? sql<SourceDocumentStoredFileDto[]>`COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', selected_file.id,
          'contentType', selected_file.content_type,
          'byteSize', selected_file.byte_size,
          'originalFilename', selected_file.original_filename
        ) ORDER BY selected_revision_file.position)
        FROM ${revisionFiles} selected_revision_file
        INNER JOIN ${storedFiles} selected_file
          ON selected_file.ledger_id = selected_revision_file.ledger_id
         AND selected_file.id = selected_revision_file.stored_file_id
         AND selected_file.deleted_at IS NULL
        WHERE selected_revision_file.ledger_id = ${ledgerId}
          AND selected_revision_file.revision_id = ${sourceDocumentRevisions.id}
          AND EXISTS (
            SELECT 1
            FROM ${sourceDocumentRevisions} owned_revision
            WHERE owned_revision.ledger_id = ${ledgerId}
              AND owned_revision.source_document_id = ${sourceDocuments.id}
              AND owned_revision.id = selected_revision_file.revision_id
          )
      ), '[]'::jsonb)`
    : sql<SourceDocumentStoredFileDto[]>`'[]'::jsonb`;
  const activeResultSummary = includeDetail
    ? sql<SourceDocumentHydrationRow["activeResultSummary"]>`CASE
        WHEN ${sourceDocuments.currentStatus} IN ('anomaly', 'failed')
          AND ${sourceDocuments.activeRevisionId} IS NOT NULL
        THEN (
          SELECT jsonb_build_object(
            'entryCount', COUNT(*)::int,
            'total', COALESCE(SUM(COALESCE(active_entry.converted_amount, active_entry.amount)), 0)::text
          )
          FROM ${ledgerEntries} active_entry
          WHERE active_entry.ledger_id = ${ledgerId}
            AND active_entry.source_document_id = ${sourceDocuments.id}
            AND active_entry.source_document_revision_id = ${sourceDocuments.activeRevisionId}
            AND active_entry.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM ${sourceDocumentRevisions} active_revision
              WHERE active_revision.ledger_id = ${ledgerId}
                AND active_revision.source_document_id = ${sourceDocuments.id}
                AND active_revision.id = active_entry.source_document_revision_id
            )
        )
        ELSE NULL
      END`
    : sql<SourceDocumentHydrationRow["activeResultSummary"]>`NULL`;

  return executor
    .select({
      documentId: sourceDocuments.id,
      revisionId: sourceDocumentRevisions.id,
      revisionTitle: sourceDocumentRevisions.title,
      submittedText: sourceDocumentRevisions.submittedText,
      revisionOutcome: sourceDocumentRevisions.outcome,
      anomalyReason: sourceDocumentRevisions.anomalyReason,
      failureCode: sourceDocumentRevisions.failureCode,
      hasImages: hasSelectedRevisionFiles(ledgerId),
      files,
      activeResultSummary,
      ...duplicateReviewColumns(),
    })
    .from(sourceDocuments)
    .leftJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
        eq(sourceDocumentRevisions.id, selectedRevisionId)
      )
    )
    .leftJoin(
      duplicateReviews,
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocuments.id),
        eq(duplicateReviews.status, "pending")
      )
    )
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        inArray(sourceDocuments.id, [...documentIds]),
        isNull(sourceDocuments.deletedAt)
      )
    );
}

export async function listTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  return db.transaction(
    async (tx) => {
      const rows = await fetchRows(tx, input, true);
      const hasMore = rows.length > input.limit;
      const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
      const hydrationRows = await hydrateSourceDocumentRows(
        tx,
        input.ledgerId,
        pageRows.map((row) => row.id),
        false
      );
      const hydrationByDocumentId = new Map(
        hydrationRows.map((hydration) => [hydration.documentId, hydration])
      );
      const last = pageRows.at(-1);
      return {
        items: pageRows.map((row) => {
          const hydration = hydrationByDocumentId.get(row.id);
          if (hydration == null) throw new ConflictError("Source document page hydration changed");
          return mapListItem(row as SourceDocumentRow, hydration);
        }),
        nextCursor: hasMore && last != null ? encodeCursor(last as SourceDocumentRow) : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

export async function getTargetSourceDocument(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDto | null> {
  return db.transaction(
    async (tx) => {
      const row = await tx.query.sourceDocuments.findFirst({
        where: and(
          eq(sourceDocuments.ledgerId, ledgerId),
          eq(sourceDocuments.id, sourceDocumentId),
          isNull(sourceDocuments.deletedAt)
        ),
      });
      if (row == null) return null;
      const hydration = (
        await hydrateSourceDocumentRows(tx, ledgerId, [sourceDocumentId], true)
      )[0];
      if (hydration == null) throw new ConflictError("Source document detail hydration changed");
      return mapSourceDocumentDetail(row as SourceDocumentRow, hydration);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
