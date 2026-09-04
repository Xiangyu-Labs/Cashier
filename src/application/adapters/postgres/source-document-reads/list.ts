import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentDto,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentDuplicateReviewDetailDto,
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
  mapDuplicateReviewEntryDto,
  mapListItem,
  mapSourceDocumentDetail,
  mapStoredFileDto,
  type SourceDocumentLedgerEntryAggregateRow,
  type SourceDocumentHydrationRow,
  type SourceDocumentRow,
  type SourceDocumentStoredFileAggregateRow,
} from "./mappers";

type QueryExecutor = Pick<typeof db, "select">;

export async function getTargetSourceDocumentAccessContext(sourceDocumentId: string) {
  const document = await db
    .select({
      ledgerId: sourceDocuments.ledgerId,
      activeRevisionId: sourceDocuments.activeRevisionId,
      pendingRevisionId: sourceDocuments.pendingRevisionId,
    })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)))
    .limit(1)
    .then((rows) => rows[0]);
  if (document == null) return null;
  const selectedRevisionId = document.pendingRevisionId ?? document.activeRevisionId;
  if (selectedRevisionId == null) return { ledgerId: document.ledgerId, hasImages: false };
  const file = await db
    .select({ id: storedFiles.id })
    .from(revisionFiles)
    .innerJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, revisionFiles.ledgerId),
        eq(sourceDocumentRevisions.id, revisionFiles.revisionId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId)
      )
    )
    .innerJoin(
      storedFiles,
      and(
        eq(storedFiles.ledgerId, revisionFiles.ledgerId),
        eq(storedFiles.id, revisionFiles.storedFileId),
        isNull(storedFiles.deletedAt)
      )
    )
    .where(
      and(
        eq(revisionFiles.ledgerId, document.ledgerId),
        eq(revisionFiles.revisionId, selectedRevisionId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);
  return { ledgerId: document.ledgerId, hasImages: file != null };
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
  return db.transaction(
    async (tx) => {
      const document = await tx.query.sourceDocuments.findFirst({
        where: and(
          eq(sourceDocuments.ledgerId, ledgerId),
          eq(sourceDocuments.id, sourceDocumentId),
          isNull(sourceDocuments.deletedAt)
        ),
        columns: { activeRevisionId: true, pendingRevisionId: true, stateVersion: true },
      });
      if (document == null) throw new NotFoundError("Source document");
      if (document.activeRevisionId == null || document.pendingRevisionId == null) {
        throw new ConflictError("Source document has no candidate to review");
      }

      const revisionIds = [document.activeRevisionId, document.pendingRevisionId];
      const revisions = await tx
        .select({ id: sourceDocumentRevisions.id, outcome: sourceDocumentRevisions.outcome })
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
            inArray(sourceDocumentRevisions.id, revisionIds)
          )
        );
      const rows = await tx
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
        .orderBy(ledgerEntries.sourceDocumentRevisionId, ledgerEntries.position);

      const pendingRevision = revisions.find(
        (revision) => revision.id === document.pendingRevisionId
      );
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
        return { entries, entryCount: entries.length, total };
      };

      return {
        sourceDocumentId,
        version: document.stateVersion,
        active: buildRevision(document.activeRevisionId),
        candidate: buildRevision(document.pendingRevisionId),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
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
  return db.transaction(
    async (tx) => {
      const review = await tx
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
      if (review == null || review.status !== "pending")
        throw new NotFoundError("Duplicate review");

      const documents = await tx
        .select({
          id: sourceDocuments.id,
          title: sourceDocuments.title,
          entryDate: sourceDocuments.entryDate,
          createdAt: sourceDocuments.createdAt,
          stateVersion: sourceDocuments.stateVersion,
          activeRevisionId: sourceDocuments.activeRevisionId,
          deletedAt: sourceDocuments.deletedAt,
        })
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.ledgerId, ledgerId),
            inArray(sourceDocuments.id, [sourceDocumentId, review.matchedSourceDocumentId])
          )
        );
      const duplicateDoc = documents.find(
        (document) => document.id === sourceDocumentId && document.deletedAt == null
      );
      if (duplicateDoc == null) throw new NotFoundError("Source document");
      const matchedDoc = documents.find(
        (document) => document.id === review.matchedSourceDocumentId
      );

      const revisionIds = [review.revisionId, review.matchedRevisionId].filter(
        (id): id is string => id != null
      );
      const revisions =
        revisionIds.length === 0
          ? []
          : await tx
              .select({
                id: sourceDocumentRevisions.id,
                sourceDocumentId: sourceDocumentRevisions.sourceDocumentId,
                title: sourceDocumentRevisions.title,
              })
              .from(sourceDocumentRevisions)
              .where(
                and(
                  eq(sourceDocumentRevisions.ledgerId, ledgerId),
                  inArray(sourceDocumentRevisions.id, revisionIds)
                )
              );
      const entries =
        revisionIds.length === 0
          ? []
          : await tx
              .select({
                revisionId: ledgerEntries.sourceDocumentRevisionId,
                id: ledgerEntries.id,
                itemName: ledgerEntries.itemName,
                description: ledgerEntries.description,
                amount: ledgerEntries.amount,
                currency: ledgerEntries.currency,
                convertedAmount: ledgerEntries.convertedAmount,
                deletedAt: ledgerEntries.deletedAt,
              })
              .from(ledgerEntries)
              .where(
                and(
                  eq(ledgerEntries.ledgerId, ledgerId),
                  inArray(ledgerEntries.sourceDocumentId, [
                    sourceDocumentId,
                    review.matchedSourceDocumentId,
                  ]),
                  inArray(ledgerEntries.sourceDocumentRevisionId, revisionIds)
                )
              )
              .orderBy(asc(ledgerEntries.sourceDocumentRevisionId), asc(ledgerEntries.position));
      const files =
        revisionIds.length === 0
          ? []
          : await tx
              .select({
                revisionId: revisionFiles.revisionId,
                id: storedFiles.id,
                contentType: storedFiles.contentType,
                byteSize: storedFiles.byteSize,
                originalFilename: storedFiles.originalFilename,
              })
              .from(revisionFiles)
              .innerJoin(
                storedFiles,
                and(
                  eq(storedFiles.ledgerId, revisionFiles.ledgerId),
                  eq(storedFiles.id, revisionFiles.storedFileId),
                  isNull(storedFiles.deletedAt)
                )
              )
              .where(
                and(
                  eq(revisionFiles.ledgerId, ledgerId),
                  inArray(revisionFiles.revisionId, revisionIds)
                )
              )
              .orderBy(asc(revisionFiles.revisionId), asc(revisionFiles.position));

      const buildSide = (revisionId: string, includeDeletedEntries: boolean) => ({
        entries: entries
          .filter(
            (entry) =>
              entry.revisionId === revisionId && (includeDeletedEntries || entry.deletedAt == null)
          )
          .map((entry) => mapDuplicateReviewEntryDto(entry, ledgerId)),
        files: files.filter((file) => file.revisionId === revisionId).map(mapStoredFileDto),
      });
      const duplicateRevision = revisions.find(
        (revision) =>
          revision.id === review.revisionId && revision.sourceDocumentId === sourceDocumentId
      );
      const duplicateSide = buildSide(review.revisionId, false);
      const matchedState: SourceDocumentDuplicateReviewDetailDto["matchedState"] =
        matchedDoc == null || matchedDoc.deletedAt != null
          ? "deleted"
          : matchedDoc.activeRevisionId !== review.matchedRevisionId
            ? "modified"
            : "unchanged";
      if (review.matchedRevisionId == null || review.matchedCreatedAt == null) {
        return {
          version: duplicateDoc.stateVersion,
          review: mapDuplicateReviewDto(review),
          duplicate: {
            id: duplicateDoc.id,
            title: effectiveDocumentTitle(duplicateDoc.title, duplicateRevision?.title),
            entryDate: duplicateDoc.entryDate,
            createdAt: duplicateDoc.createdAt.toISOString(),
            ...duplicateSide,
          },
          matched: null,
          matchedState: "deleted",
        };
      }
      const matchedRevision = revisions.find(
        (revision) =>
          revision.id === review.matchedRevisionId &&
          revision.sourceDocumentId === review.matchedSourceDocumentId
      );
      return {
        version: duplicateDoc.stateVersion,
        review: mapDuplicateReviewDto(review),
        duplicate: {
          id: duplicateDoc.id,
          title: effectiveDocumentTitle(duplicateDoc.title, duplicateRevision?.title),
          entryDate: duplicateDoc.entryDate,
          createdAt: duplicateDoc.createdAt.toISOString(),
          ...duplicateSide,
        },
        matched: {
          id: review.matchedSourceDocumentId,
          title: effectiveDocumentTitle(review.matchedTitle, matchedRevision?.title),
          entryDate: review.matchedEntryDate,
          createdAt: review.matchedCreatedAt.toISOString(),
          ...buildSide(review.matchedRevisionId, true),
        },
        matchedState,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
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
  const baseRows = await executor
    .select({
      documentId: sourceDocuments.id,
      selectedRevisionId: sourceDocumentRevisions.id,
      activeRevisionId: sourceDocuments.activeRevisionId,
      revisionTitle: sourceDocumentRevisions.title,
      submittedText: sourceDocumentRevisions.submittedText,
      revisionOutcome: sourceDocumentRevisions.outcome,
      anomalyReason: sourceDocumentRevisions.anomalyReason,
      failureCode: sourceDocumentRevisions.failureCode,
      ...duplicateReviewColumns(),
    })
    .from(sourceDocuments)
    .leftJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
        or(
          and(
            isNotNull(sourceDocuments.pendingRevisionId),
            eq(sourceDocumentRevisions.id, sourceDocuments.pendingRevisionId)
          ),
          and(
            isNull(sourceDocuments.pendingRevisionId),
            eq(sourceDocumentRevisions.id, sourceDocuments.activeRevisionId)
          )
        )
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

  const selectedRevisionIds = baseRows.flatMap((row) =>
    row.selectedRevisionId == null ? [] : [row.selectedRevisionId]
  );
  const filesByRevision = new Map<string, SourceDocumentStoredFileAggregateRow[]>();
  const revisionsWithFiles = new Set<string>();
  if (selectedRevisionIds.length > 0 && includeDetail) {
    const fileRows = await executor
      .select({
        revisionId: revisionFiles.revisionId,
        id: storedFiles.id,
        contentType: storedFiles.contentType,
        byteSize: storedFiles.byteSize,
        originalFilename: storedFiles.originalFilename,
      })
      .from(revisionFiles)
      .innerJoin(
        storedFiles,
        and(
          eq(storedFiles.ledgerId, revisionFiles.ledgerId),
          eq(storedFiles.id, revisionFiles.storedFileId),
          isNull(storedFiles.deletedAt)
        )
      )
      .where(
        and(
          eq(revisionFiles.ledgerId, ledgerId),
          inArray(revisionFiles.revisionId, selectedRevisionIds)
        )
      )
      .orderBy(asc(revisionFiles.revisionId), asc(revisionFiles.position));
    for (const file of fileRows) {
      revisionsWithFiles.add(file.revisionId);
      const files = filesByRevision.get(file.revisionId) ?? [];
      files.push(file);
      filesByRevision.set(file.revisionId, files);
    }
  } else if (selectedRevisionIds.length > 0) {
    const fileRevisions = await executor
      .select({ revisionId: revisionFiles.revisionId })
      .from(revisionFiles)
      .innerJoin(
        storedFiles,
        and(
          eq(storedFiles.ledgerId, revisionFiles.ledgerId),
          eq(storedFiles.id, revisionFiles.storedFileId),
          isNull(storedFiles.deletedAt)
        )
      )
      .where(
        and(
          eq(revisionFiles.ledgerId, ledgerId),
          inArray(revisionFiles.revisionId, selectedRevisionIds)
        )
      )
      .groupBy(revisionFiles.revisionId);
    for (const file of fileRevisions) revisionsWithFiles.add(file.revisionId);
  }

  const relevantRevisionIds = includeDetail
    ? [
        ...new Set([
          ...selectedRevisionIds,
          ...baseRows.flatMap((row) =>
            row.activeRevisionId == null ? [] : [row.activeRevisionId]
          ),
        ]),
      ]
    : [];
  const entryRows =
    relevantRevisionIds.length === 0
      ? []
      : await executor
          .select({
            revisionId: ledgerEntries.sourceDocumentRevisionId,
            id: ledgerEntries.id,
            ledgerId: ledgerEntries.ledgerId,
            categoryId: ledgerEntries.categoryId,
            sourceDocumentId: ledgerEntries.sourceDocumentId,
            amount: ledgerEntries.amount,
            currency: ledgerEntries.currency,
            itemName: ledgerEntries.itemName,
            description: ledgerEntries.description,
            convertedAmount: ledgerEntries.convertedAmount,
            exchangeRate: ledgerEntries.exchangeRate,
            createdAt: ledgerEntries.createdAt,
            updatedAt: ledgerEntries.updatedAt,
            deletedAt: ledgerEntries.deletedAt,
            category: entryCategories,
          })
          .from(ledgerEntries)
          .leftJoin(
            entryCategories,
            and(
              eq(entryCategories.ledgerId, ledgerEntries.ledgerId),
              eq(entryCategories.id, ledgerEntries.categoryId),
              isNull(entryCategories.deletedAt)
            )
          )
          .where(
            and(
              eq(ledgerEntries.ledgerId, ledgerId),
              inArray(ledgerEntries.sourceDocumentId, [...documentIds]),
              inArray(ledgerEntries.sourceDocumentRevisionId, relevantRevisionIds),
              isNull(ledgerEntries.deletedAt)
            )
          )
          .orderBy(
            asc(ledgerEntries.sourceDocumentRevisionId),
            asc(ledgerEntries.position),
            asc(ledgerEntries.id)
          );
  const entriesByRevision = new Map<string, SourceDocumentLedgerEntryAggregateRow[]>();
  for (const entry of entryRows) {
    if (entry.revisionId == null || entry.sourceDocumentId == null) continue;
    const entries = entriesByRevision.get(entry.revisionId) ?? [];
    entries.push({
      id: entry.id,
      ledgerId: entry.ledgerId,
      categoryId: entry.categoryId,
      sourceDocumentId: entry.sourceDocumentId,
      amount: entry.amount,
      currency: entry.currency ?? "CNY",
      itemName: entry.itemName,
      description: entry.description,
      convertedAmount: entry.convertedAmount,
      exchangeRate: entry.exchangeRate,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      deletedAt: entry.deletedAt?.toISOString() ?? null,
      category:
        entry.category == null
          ? null
          : {
              ...entry.category,
              createdAt: entry.category.createdAt.toISOString(),
              updatedAt: entry.category.updatedAt.toISOString(),
              deletedAt: entry.category.deletedAt?.toISOString() ?? null,
            },
    });
    entriesByRevision.set(entry.revisionId, entries);
  }

  return baseRows.map((row) => {
    const selectedEntries =
      row.selectedRevisionId == null ? [] : (entriesByRevision.get(row.selectedRevisionId) ?? []);
    const activeEntries =
      row.activeRevisionId == null ? [] : (entriesByRevision.get(row.activeRevisionId) ?? []);
    return {
      ...row,
      hasImages: row.selectedRevisionId != null && revisionsWithFiles.has(row.selectedRevisionId),
      files:
        includeDetail && row.selectedRevisionId != null
          ? (filesByRevision.get(row.selectedRevisionId) ?? [])
          : [],
      ledgerEntries: includeDetail ? selectedEntries : [],
      activeResultSummary:
        includeDetail &&
        (row.revisionOutcome === "anomaly" || row.revisionOutcome === "failed") &&
        row.activeRevisionId != null
          ? {
              entryCount: activeEntries.length,
              total: activeEntries.reduce(
                (sum, entry) => decimalAdd(sum, entry.convertedAmount ?? entry.amount),
                "0"
              ),
            }
          : null,
    };
  });
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
