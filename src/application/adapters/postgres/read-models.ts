import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentStoredFileDto,
  SourceDocumentDto,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
  SourceDocumentCandidateComparisonDto,
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentLedgerEntryDto,
} from "@/modules/source-document/contracts";
import type { PendingDuplicateReviewContract } from "@/modules/source-document/application/ports";
import {
  PROCESSING_FAILURE_CODES,
  supportedSourceDocumentActions,
  type ApplicationErrorCode,
  type ProcessingFailureCode,
  type RevisionOutcome,
} from "@/application/contracts";
import { parseAmount } from "@/lib/formatters";
import { add as decimalAdd, normalize as decimalNormalize } from "@/lib/money/decimal";
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

export interface TargetSourceDocumentFilterInput {
  ledgerId: string;
  ids?: readonly string[];
  statuses?: readonly SourceDocumentStatusType[];
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface TargetSourceDocumentListInput extends TargetSourceDocumentFilterInput {
  cursor?: string | null;
  limit: number;
  includeFiles?: boolean;
}

export async function getTargetSourceDocumentAccessContext(sourceDocumentId: string) {
  const document = await db.query.sourceDocuments.findFirst({
    where: and(eq(sourceDocuments.id, sourceDocumentId), isNull(sourceDocuments.deletedAt)),
    columns: { ledgerId: true, activeRevisionId: true, pendingRevisionId: true },
  });
  if (document == null) return null;
  const revisionId = document.pendingRevisionId ?? document.activeRevisionId;
  const hasFiles =
    revisionId != null &&
    (await db.query.revisionFiles.findFirst({
      where: and(
        eq(revisionFiles.ledgerId, document.ledgerId),
        eq(revisionFiles.revisionId, revisionId)
      ),
      columns: { id: true },
    })) != null;
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
        categoryIsEditable: entryCategories.isEditable,
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
              isEditable: row.categoryIsEditable ?? true,
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

async function loadDuplicateReviewMap(
  rows: readonly SourceDocumentRow[]
): Promise<Map<string, SourceDocumentDuplicateReviewDto>> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return new Map();
  const reviews = await db
    .select()
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, rows[0]!.ledgerId),
        inArray(duplicateReviews.sourceDocumentId, ids)
      )
    );
  const result = new Map<string, SourceDocumentDuplicateReviewDto>();
  for (const review of reviews) {
    // Only an unresolved review is surfaced on the DTO; resolved reviews are
    // no longer actionable in the UI.
    if (review.status !== "pending") continue;
    result.set(review.sourceDocumentId, {
      sourceDocumentId: review.sourceDocumentId,
      revisionId: review.revisionId,
      matchedSourceDocumentId: review.matchedSourceDocumentId,
      matchedRevisionId: review.matchedRevisionId,
      status: review.status,
      reason: review.reason,
      confidence: review.confidence == null ? null : Number(review.confidence),
    });
  }
  return result;
}

async function loadDuplicateReviewSide(
  ledgerId: string,
  revisionId: string,
  options: { includeDeletedEntries?: boolean } = {}
): Promise<{
  entries: SourceDocumentLedgerEntryDto[];
  files: SourceDocumentStoredFileDto[];
}> {
  const [entries, files] = await Promise.all([
    db
      .select({
        id: ledgerEntries.id,
        itemName: ledgerEntries.itemName,
        description: ledgerEntries.description,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        convertedAmount: ledgerEntries.convertedAmount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentRevisionId, revisionId),
          ...(options.includeDeletedEntries === true ? [] : [isNull(ledgerEntries.deletedAt)])
        )
      )
      .orderBy(asc(ledgerEntries.position)),
    db
      .select({
        id: storedFiles.id,
        contentType: storedFiles.contentType,
        byteSize: storedFiles.byteSize,
        originalFilename: storedFiles.originalFilename,
      })
      .from(revisionFiles)
      .innerJoin(
        storedFiles,
        and(
          eq(storedFiles.id, revisionFiles.storedFileId),
          eq(storedFiles.ledgerId, revisionFiles.ledgerId),
          isNull(storedFiles.deletedAt)
        )
      )
      .where(and(eq(revisionFiles.ledgerId, ledgerId), eq(revisionFiles.revisionId, revisionId)))
      .orderBy(asc(revisionFiles.position)),
  ]);
  return {
    entries: entries.map((entry) => ({
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
    })),
    files: files.map((file) => ({
      id: file.id,
      contentType: file.contentType,
      byteSize: file.byteSize,
      originalFilename: file.originalFilename,
    })),
  };
}

function effectiveDocumentTitle(
  documentTitle: string | null | undefined,
  revisionTitle: string | null | undefined
): string | null {
  for (const value of [documentTitle, revisionTitle]) {
    const normalized = value?.trim();
    if (normalized != null && normalized !== "") return normalized;
  }
  return null;
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
      review: {
        sourceDocumentId: review.sourceDocumentId,
        revisionId: review.revisionId,
        matchedSourceDocumentId: review.matchedSourceDocumentId,
        matchedRevisionId: review.matchedRevisionId,
        status: review.status,
        reason: review.reason,
        confidence: review.confidence == null ? null : Number(review.confidence),
      },
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
    review: {
      sourceDocumentId: review.sourceDocumentId,
      revisionId: review.revisionId,
      matchedSourceDocumentId: review.matchedSourceDocumentId,
      matchedRevisionId: review.matchedRevisionId,
      status: review.status,
      reason: review.reason,
      confidence: review.confidence == null ? null : Number(review.confidence),
    },
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

type SourceDocumentRow = typeof sourceDocuments.$inferSelect;

function baseConditions(input: TargetSourceDocumentFilterInput): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(sourceDocuments.ledgerId, input.ledgerId),
    isNull(sourceDocuments.deletedAt),
  ];
  if (input.ids != null) {
    conditions.push(input.ids.length === 0 ? sql`false` : inArray(sourceDocuments.id, input.ids));
  }

  if (input.statuses != null && input.statuses.length > 0) {
    const activeStatuses = input.statuses.filter((status) => status !== "deleted");
    if (activeStatuses.length === 0) {
      conditions.push(sql`false`);
    } else {
      conditions.push(inArray(sourceDocuments.currentStatus, activeStatuses));
    }
  }
  if (input.startDate != null && input.startDate !== "") {
    conditions.push(sql`${sourceDocuments.effectiveDate} >= ${input.startDate}::date`);
  }
  if (input.endDate != null && input.endDate !== "") {
    conditions.push(sql`${sourceDocuments.effectiveDate} <= ${input.endDate}::date`);
  }
  if (
    input.minAmount !== undefined ||
    input.maxAmount !== undefined ||
    (input.search != null && input.search !== "")
  ) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ledger_entries AS matched_entries
      WHERE matched_entries.ledger_id = ${input.ledgerId}
        AND matched_entries.source_document_id = ${sourceDocuments.id}
        AND matched_entries.source_document_revision_id = ${sourceDocuments.activeRevisionId}
        AND matched_entries.deleted_at IS NULL
        ${input.minAmount !== undefined ? sql`AND matched_entries.converted_amount IS NOT NULL AND matched_entries.converted_amount >= ${input.minAmount}` : sql``}
        ${input.maxAmount !== undefined ? sql`AND matched_entries.converted_amount IS NOT NULL AND matched_entries.converted_amount <= ${input.maxAmount}` : sql``}
        ${
          input.search != null && input.search !== ""
            ? sql`AND (
          position(lower(${input.search}) in lower(matched_entries.item_name)) > 0
          OR position(lower(${input.search}) in lower(COALESCE(matched_entries.description, ''))) > 0
        )`
            : sql``
        }
    )`);
  }
  return conditions;
}

/**
 * Sum active projections across the full filtered Stream result. A
 * `duplicate_pending` document is already a valid accounting projection, so it
 * shares the completed total semantics until it is discarded.
 */
export async function calculateCompletedSourceDocumentTotal(
  input: TargetSourceDocumentFilterInput
): Promise<{ total: string; unconvertedCount: number }> {
  const matchedEntryConditions: SQL<unknown>[] = [];
  if (input.minAmount !== undefined) {
    matchedEntryConditions.push(
      sql`${ledgerEntries.convertedAmount} IS NOT NULL
        AND ${ledgerEntries.convertedAmount} >= ${input.minAmount}`
    );
  }
  if (input.maxAmount !== undefined) {
    matchedEntryConditions.push(
      sql`${ledgerEntries.convertedAmount} IS NOT NULL
        AND ${ledgerEntries.convertedAmount} <= ${input.maxAmount}`
    );
  }
  if (input.search != null && input.search !== "") {
    matchedEntryConditions.push(sql`(
      position(lower(${input.search}) in lower(${ledgerEntries.itemName})) > 0
      OR position(lower(${input.search}) in lower(COALESCE(${ledgerEntries.description}, ''))) > 0
    )`);
  }
  const result = await db
    .select({
      total: sql<string>`SUM(${ledgerEntries.convertedAmount})`,
      unconvertedCount: sql<number>`COUNT(*) FILTER (
        WHERE ${ledgerEntries.convertedAmount} IS NULL
      )`,
    })
    .from(sourceDocuments)
    .innerJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.ledgerId, sourceDocuments.ledgerId),
        eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
        eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.activeRevisionId),
        isNull(ledgerEntries.deletedAt),
        ...matchedEntryConditions
      )
    )
    .where(
      and(
        ...baseConditions(input),
        inArray(sourceDocuments.currentStatus, ["completed", "duplicate_pending"])
      )
    )
    .then((rows) => rows[0]);

  return {
    total: decimalNormalize(String(result?.total ?? "0")),
    unconvertedCount: Number(result?.unconvertedCount ?? 0),
  };
}

function decodeCursor(cursor: string): { entryDate: string; createdAt: Date; id: string } | null {
  const [entryDate, createdAtValue, id, ...rest] = cursor.split("|");
  if (
    rest.length > 0 ||
    entryDate == null ||
    entryDate === "" ||
    createdAtValue == null ||
    createdAtValue === "" ||
    id == null ||
    id === ""
  ) {
    return null;
  }
  const createdAt = new Date(createdAtValue);
  return Number.isNaN(createdAt.getTime()) ? null : { entryDate, createdAt, id };
}

function cursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
  if (cursor == null || cursor === "") return null;
  const decoded = decodeCursor(cursor);
  if (decoded == null) return null;
  return (
    or(
      sql`${sourceDocuments.effectiveDate} < ${decoded.entryDate}::date`,
      and(
        sql`${sourceDocuments.effectiveDate} = ${decoded.entryDate}::date`,
        lt(sourceDocuments.createdAt, decoded.createdAt)
      ),
      and(
        sql`${sourceDocuments.effectiveDate} = ${decoded.entryDate}::date`,
        eq(sourceDocuments.createdAt, decoded.createdAt),
        sql`${sourceDocuments.id} < ${decoded.id}`
      )
    ) ?? null
  );
}

function encodeCursor(row: SourceDocumentRow): string {
  return `${row.effectiveDate}|${row.createdAt.toISOString()}|${row.id}`;
}

async function loadRevisionFacts(rows: readonly SourceDocumentRow[]) {
  const revisionIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.activeRevisionId, row.pendingRevisionId].filter(
          (value): value is string => value != null
        )
      )
    ),
  ];
  if (revisionIds.length === 0)
    return new Map<string, typeof sourceDocumentRevisions.$inferSelect>();
  const revisions = await db
    .select()
    .from(sourceDocumentRevisions)
    .where(inArray(sourceDocumentRevisions.id, revisionIds));
  return new Map(revisions.map((revision) => [revision.id, revision]));
}

function statusForRow(
  row: SourceDocumentRow,
  _revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>
): SourceDocumentStatusType {
  return row.currentStatus;
}

async function loadFiles(
  rows: readonly SourceDocumentRow[]
): Promise<Map<string, SourceDocumentStoredFileDto[]>> {
  const selected = new Map(
    rows.flatMap((row) => {
      const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
      return revisionId == null ? [] : [[revisionId, row.id] as const];
    })
  );
  if (selected.size === 0) return new Map();
  const files = await db
    .select({
      revisionId: revisionFiles.revisionId,
      id: revisionFiles.storedFileId,
      contentType: storedFiles.contentType,
      byteSize: storedFiles.byteSize,
      originalFilename: storedFiles.originalFilename,
    })
    .from(revisionFiles)
    .innerJoin(
      storedFiles,
      and(
        eq(storedFiles.id, revisionFiles.storedFileId),
        eq(storedFiles.ledgerId, revisionFiles.ledgerId),
        isNull(storedFiles.deletedAt)
      )
    )
    .where(inArray(revisionFiles.revisionId, [...selected.keys()]))
    .orderBy(revisionFiles.position);
  const result = new Map<string, SourceDocumentStoredFileDto[]>();
  for (const file of files) {
    const documentId = selected.get(file.revisionId);
    if (documentId == null) continue;
    const ids = result.get(documentId) ?? [];
    ids.push({
      id: file.id,
      contentType: file.contentType,
      byteSize: file.byteSize,
      originalFilename: file.originalFilename,
    });
    result.set(documentId, ids);
  }
  return result;
}

async function loadFileData(
  rows: readonly SourceDocumentRow[],
  includeFiles: boolean
): Promise<{
  files: Map<string, SourceDocumentStoredFileDto[]>;
  hasImages: Map<string, boolean>;
}> {
  if (includeFiles) {
    const files = await loadFiles(rows);
    return {
      files,
      hasImages: new Map(rows.map((row) => [row.id, (files.get(row.id)?.length ?? 0) > 0])),
    };
  }

  const selected = new Map(
    rows.flatMap((row) => {
      const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
      return revisionId == null ? [] : [[revisionId, row.id] as const];
    })
  );
  if (selected.size === 0) return { files: new Map(), hasImages: new Map() };

  const revisionsWithFiles = await db
    .selectDistinct({ revisionId: revisionFiles.revisionId })
    .from(revisionFiles)
    .where(inArray(revisionFiles.revisionId, [...selected.keys()]));
  const revisionIds = new Set(revisionsWithFiles.map((row) => row.revisionId));
  const hasImages = new Map<string, boolean>();
  for (const [revisionId, documentId] of selected) {
    if (revisionIds.has(revisionId)) hasImages.set(documentId, true);
  }
  return { files: new Map(), hasImages };
}

function mapListItem(
  row: SourceDocumentRow,
  revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>,
  files: ReadonlyMap<string, readonly SourceDocumentStoredFileDto[]>,
  hasImages: ReadonlyMap<string, boolean>,
  includeFiles = false
): SourceDocumentListItemDto {
  const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const revision = revisionId == null ? null : revisions.get(revisionId);
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: effectiveDocumentTitle(row.title, revision?.title),
    text: null,
    files: includeFiles ? [...(files.get(row.id) ?? [])] : [],
    status: statusForRow(row, revisions),
    type: row.type,
    anomalyReason: revision?.anomalyReason ?? null,
    entryDate: row.entryDate,
    metadata: {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: null,
    hasImages: hasImages.get(row.id) ?? (files.get(row.id)?.length ?? 0) > 0,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null ? null : ((revision?.outcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(revision?.outcome, revision?.failureCode),
    pendingRevisionId: row.pendingRevisionId,
  };
}

function summarizeProjection(
  entries: Array<{
    amount: string;
    currency: string | null;
    convertedAmount: string | null;
  }>
): SourceDocumentCandidateProjectionSummary {
  const total = entries.reduce((sum, entry) => {
    const amt =
      entry.convertedAmount != null && entry.convertedAmount !== ""
        ? parseAmount(entry.convertedAmount)
        : parseAmount(entry.amount);
    return sum + amt;
  }, 0);
  return {
    entryCount: entries.length,
    total: total.toFixed(2),
  };
}

async function loadActiveResultSummaryMap(
  rows: readonly SourceDocumentRow[],
  revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>
): Promise<Map<string, SourceDocumentCandidateProjectionSummary>> {
  const activeTargetIds = rows
    .filter((row) => {
      if (row.activeRevisionId == null) return false;
      const status = statusForRow(row, revisions);
      return status === "anomaly" || status === "failed";
    })
    .map((row) => row.activeRevisionId!)
    .filter((id): id is string => id != null);

  if (activeTargetIds.length === 0) return new Map();

  const uniqueIds = [...new Set(activeTargetIds)];

  const entries = await db
    .select({
      revisionId: ledgerEntries.sourceDocumentRevisionId,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      convertedAmount: ledgerEntries.convertedAmount,
    })
    .from(ledgerEntries)
    .where(
      and(
        inArray(ledgerEntries.sourceDocumentRevisionId, uniqueIds),
        isNull(ledgerEntries.deletedAt)
      )
    );

  const entriesByRevision = new Map<
    string,
    Array<{ amount: string; currency: string | null; convertedAmount: string | null }>
  >();
  for (const entry of entries) {
    if (entry.revisionId == null) continue;
    const group = entriesByRevision.get(entry.revisionId) ?? [];
    group.push(entry);
    entriesByRevision.set(entry.revisionId, group);
  }

  const result = new Map<string, SourceDocumentCandidateProjectionSummary>();
  for (const row of rows) {
    if (row.activeRevisionId == null) continue;
    const status = statusForRow(row, revisions);
    if (status !== "anomaly" && status !== "failed") continue;
    const activeEntries = entriesByRevision.get(row.activeRevisionId) ?? [];
    result.set(row.id, summarizeProjection(activeEntries));
  }

  return result;
}

async function loadCandidateComparisonMap(
  rows: readonly SourceDocumentRow[],
  revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>
): Promise<Map<string, SourceDocumentCandidateComparisonDto>> {
  const candidatePairs = rows
    .filter((row) => {
      if (row.activeRevisionId == null || row.pendingRevisionId == null) return false;
      const pendingOutcome = revisions.get(row.pendingRevisionId)?.outcome;
      return pendingOutcome === "completed";
    })
    .map((row) => ({
      sourceDocumentId: row.id,
      activeRevisionId: row.activeRevisionId!,
      pendingRevisionId: row.pendingRevisionId!,
    }));

  if (candidatePairs.length === 0) return new Map();

  const allRevisionIds = [
    ...new Set(candidatePairs.flatMap((p) => [p.activeRevisionId, p.pendingRevisionId])),
  ];

  const entries = await db
    .select({
      revisionId: ledgerEntries.sourceDocumentRevisionId,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      convertedAmount: ledgerEntries.convertedAmount,
    })
    .from(ledgerEntries)
    .where(
      and(
        inArray(ledgerEntries.sourceDocumentRevisionId, allRevisionIds),
        isNull(ledgerEntries.deletedAt)
      )
    );

  const entriesByRevision = new Map<
    string,
    Array<{ amount: string; currency: string | null; convertedAmount: string | null }>
  >();
  for (const entry of entries) {
    if (entry.revisionId == null) continue;
    const group = entriesByRevision.get(entry.revisionId) ?? [];
    group.push(entry);
    entriesByRevision.set(entry.revisionId, group);
  }

  const result = new Map<string, SourceDocumentCandidateComparisonDto>();
  for (const pair of candidatePairs) {
    const activeEntries = entriesByRevision.get(pair.activeRevisionId) ?? [];
    const candidateEntries = entriesByRevision.get(pair.pendingRevisionId) ?? [];
    const active = summarizeProjection(activeEntries);
    const candidate = summarizeProjection(candidateEntries);
    result.set(pair.sourceDocumentId, {
      active,
      candidate,
      changed: active.total !== candidate.total || active.entryCount !== candidate.entryCount,
    });
  }

  return result;
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
    return failureCode as ProcessingFailureCode;
  }
  if (
    failureCode != null &&
    (PROCESSING_FAILURE_CODES as readonly string[]).includes(failureCode)
  ) {
    return failureCode as ApplicationErrorCode;
  }
  return "PROCESSING_UNAVAILABLE";
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
    loadFileData(pageRows, input.includeFiles === true),
  ]);
  const [candidateComparisonMap, activeResultSummaryMap, duplicateReviewMap] = await Promise.all([
    loadCandidateComparisonMap(pageRows, revisions),
    loadActiveResultSummaryMap(pageRows, revisions),
    loadDuplicateReviewMap(pageRows),
  ]);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => {
      const item = mapListItem(
        row,
        revisions,
        fileData.files,
        fileData.hasImages,
        input.includeFiles === true
      );
      if (item.status === "candidate_pending") {
        const comparison = candidateComparisonMap.get(row.id);
        if (comparison !== undefined) {
          item.candidateComparison = comparison;
        }
      }
      if ((item.status === "anomaly" || item.status === "failed") && row.activeRevisionId != null) {
        const summary = activeResultSummaryMap.get(row.id);
        if (summary !== undefined) {
          item.activeResultSummary = summary;
        }
      }
      const duplicateReview = duplicateReviewMap.get(row.id);
      if (duplicateReview !== undefined) {
        item.duplicateReview = duplicateReview;
      }
      return item;
    }),
    nextCursor: hasMore && last != null ? encodeCursor(last) : null,
  };
}

export async function collectTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  const conditions = baseConditions(input);
  const [countRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(sourceDocuments)
      .where(and(...conditions))
      .then((result) => result[0]),
    fetchRows(input, false),
  ]);
  const hasMore = rows.length > input.limit;
  const resultRows = hasMore ? rows.slice(0, input.limit) : rows;
  const [revisions, fileData] = await Promise.all([
    loadRevisionFacts(resultRows),
    loadFileData(resultRows, input.includeFiles === true),
  ]);
  const [candidateComparisonMap, activeResultSummaryMap, duplicateReviewMap] = await Promise.all([
    loadCandidateComparisonMap(resultRows, revisions),
    loadActiveResultSummaryMap(resultRows, revisions),
    loadDuplicateReviewMap(resultRows),
  ]);
  return {
    items: resultRows.map((row) => {
      const item = mapListItem(
        row,
        revisions,
        fileData.files,
        fileData.hasImages,
        input.includeFiles === true
      );
      if (item.status === "candidate_pending") {
        const comparison = candidateComparisonMap.get(row.id);
        if (comparison !== undefined) {
          item.candidateComparison = comparison;
        }
      }
      if ((item.status === "anomaly" || item.status === "failed") && row.activeRevisionId != null) {
        const summary = activeResultSummaryMap.get(row.id);
        if (summary !== undefined) {
          item.activeResultSummary = summary;
        }
      }
      const duplicateReview = duplicateReviewMap.get(row.id);
      if (duplicateReview !== undefined) {
        item.duplicateReview = duplicateReview;
      }
      return item;
    }),
    hasMore,
    total: Number(countRow?.count ?? 0),
  };
}

/**
 * Lightweight aggregation that returns the processing count
 * and attention count (candidate_pending + anomaly + failed) for a ledger.
 * Reads the transactionally maintained current status without revision subqueries.
 */
export async function countSourceDocumentsByStatus(ledgerId: string): Promise<{
  processingCount: number;
  attentionCount: number;
}> {
  const result = await db
    .select({
      processingCount: sql<number>`COUNT(*) FILTER (WHERE ${sourceDocuments.currentStatus} = 'processing')`,
      attentionCount: sql<number>`COUNT(*) FILTER (WHERE ${sourceDocuments.currentStatus} IN ('candidate_pending', 'duplicate_pending', 'anomaly', 'failed'))`,
    })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt)))
    .then((rows) => rows[0] ?? { processingCount: 0, attentionCount: 0 });

  return {
    processingCount: Number(result.processingCount ?? 0),
    attentionCount: Number(result.attentionCount ?? 0),
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
  const status = statusForRow(row, revisions);

  // Load active result summary for anomaly/failed documents with an active revision
  let activeResultSummary: SourceDocumentCandidateProjectionSummary | undefined;
  if ((status === "anomaly" || status === "failed") && row.activeRevisionId != null) {
    const summaryMap = await loadActiveResultSummaryMap([row], revisions);
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
        pendingOutcome:
          row.pendingRevisionId == null
            ? null
            : ((selectedRevision?.outcome as RevisionOutcome) ?? null),
        duplicateReviewPending: row.currentStatus === "duplicate_pending",
      }),
    ],
    errorCode: sanitizedErrorCode(selectedRevision?.outcome, selectedRevision?.failureCode),
    pendingRevisionId: row.pendingRevisionId,
    ...(duplicateReview !== undefined ? { duplicateReview } : {}),
    ...(activeResultSummary !== undefined ? { activeResultSummary } : {}),
  };
}
