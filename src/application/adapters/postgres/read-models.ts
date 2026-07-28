import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
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
} from "@/modules/source-document/contracts";
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
  entryCategories,
  ledgerEntries,
  revisionEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { ConflictError, NotFoundError } from "@/lib/errors";

/**
 * Effective date: `entryDate` if present, otherwise the ISO calendar date
 * derived from `createdAt`.  Used for date filters, ORDER BY, cursor
 * comparison, cursor encoding, and grouping — everything that needs the
 * canonical business-date value.
 */
const EFFECTIVE_DATE = sql<string>`COALESCE(${sourceDocuments.entryDate}, to_char(${sourceDocuments.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD'))`;

export interface TargetSourceDocumentFilterInput {
  ledgerId: string;
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
        revisionId: revisionEntries.revisionId,
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
      .from(revisionEntries)
      .innerJoin(
        ledgerEntries,
        and(
          eq(ledgerEntries.ledgerId, revisionEntries.ledgerId),
          eq(ledgerEntries.id, revisionEntries.ledgerEntryId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .leftJoin(
        entryCategories,
        and(
          eq(entryCategories.ledgerId, ledgerEntries.ledgerId),
          eq(entryCategories.id, ledgerEntries.categoryId)
        )
      )
      .where(
        and(
          eq(revisionEntries.ledgerId, ledgerId),
          inArray(revisionEntries.revisionId, revisionIds)
        )
      )
      .orderBy(revisionEntries.revisionId, revisionEntries.position),
  ]);

  const pendingRevision = revisions.find((revision) => revision.id === document.pendingRevisionId);
  if (pendingRevision?.outcome !== "completed") {
    throw new ConflictError("Candidate revision is no longer available for review");
  }

  const entriesByRevision = new Map<string, SourceDocumentCandidateReviewEntryDto[]>();
  for (const row of rows) {
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

type SourceDocumentRow = typeof sourceDocuments.$inferSelect;

function pendingOutcomeSubquery() {
  return sql<string>`(
    SELECT pending.outcome
    FROM source_document_revisions AS pending
    WHERE pending.ledger_id = ${sourceDocuments.ledgerId}
      AND pending.source_document_id = ${sourceDocuments.id}
      AND pending.id = ${sourceDocuments.pendingRevisionId}
  )`;
}

function derivedStatusExpression() {
  return sql<SourceDocumentStatusType>`CASE
    WHEN ${sourceDocuments.pendingRevisionId} IS NOT NULL AND ${sourceDocuments.activeRevisionId} IS NOT NULL THEN
      CASE
        WHEN ${pendingOutcomeSubquery()} = 'completed' THEN 'candidate_pending'
        ELSE ${pendingOutcomeSubquery()}
      END
    WHEN ${sourceDocuments.pendingRevisionId} IS NOT NULL THEN ${pendingOutcomeSubquery()}
    WHEN ${sourceDocuments.activeRevisionId} IS NOT NULL THEN (
      SELECT active.outcome
      FROM source_document_revisions AS active
      WHERE active.ledger_id = ${sourceDocuments.ledgerId}
        AND active.source_document_id = ${sourceDocuments.id}
        AND active.id = ${sourceDocuments.activeRevisionId}
    )
    ELSE NULL
  END`;
}

function baseConditions(input: TargetSourceDocumentFilterInput): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(sourceDocuments.ledgerId, input.ledgerId),
    isNull(sourceDocuments.deletedAt),
    sql`${derivedStatusExpression()} IS NOT NULL`,
  ];

  if (input.statuses != null && input.statuses.length > 0) {
    conditions.push(inArray(derivedStatusExpression(), [...input.statuses]));
  }
  if (input.startDate != null && input.startDate !== "") {
    conditions.push(sql`${EFFECTIVE_DATE} >= ${input.startDate}`);
  }
  if (input.endDate != null && input.endDate !== "") {
    conditions.push(sql`${EFFECTIVE_DATE} <= ${input.endDate}`);
  }
  if (input.minAmount !== undefined || input.maxAmount !== undefined) {
    const totalAmount = sql<string>`COALESCE((
      SELECT SUM(ABS(COALESCE(entries.converted_amount, entries.amount)))
      FROM ledger_entries AS entries
      WHERE entries.ledger_id = ${input.ledgerId}
        AND entries.source_document_id = ${sourceDocuments.id}
        AND entries.source_document_revision_id = ${sourceDocuments.activeRevisionId}
        AND entries.deleted_at IS NULL
    ), 0)`;
    if (input.minAmount !== undefined) {
      conditions.push(sql`${totalAmount} >= ${input.minAmount}`);
    }
    if (input.maxAmount !== undefined) {
      conditions.push(sql`${totalAmount} <= ${input.maxAmount}`);
    }
  }
  if (input.search != null && input.search !== "") {
    conditions.push(sql`(
      position(lower(${input.search}) in lower(COALESCE(${sourceDocuments.title}, ''))) > 0
      OR EXISTS (
        SELECT 1
        FROM ledger_entries AS search_entries
        WHERE search_entries.ledger_id = ${input.ledgerId}
          AND search_entries.source_document_id = ${sourceDocuments.id}
          AND search_entries.source_document_revision_id = ${sourceDocuments.activeRevisionId}
          AND search_entries.deleted_at IS NULL
          AND (
            position(lower(${input.search}) in lower(search_entries.item_name)) > 0
            OR position(lower(${input.search}) in lower(COALESCE(search_entries.description, ''))) > 0
          )
      )
    )`);
  }
  return conditions;
}

/**
 * Sum completed active projections across the full filtered Stream result.
 * Non-completed records may have an older active projection, but those amounts
 * are intentionally excluded until the document returns to completed.
 */
export async function calculateCompletedSourceDocumentTotal(
  input: TargetSourceDocumentFilterInput
): Promise<{ total: string }> {
  const derivedStatus = derivedStatusExpression();
  const result = await db
    .select({
      total: sql<string>`SUM(COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}))`,
    })
    .from(sourceDocuments)
    .innerJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.ledgerId, sourceDocuments.ledgerId),
        eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
        eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.activeRevisionId),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .where(and(...baseConditions(input), eq(derivedStatus, "completed")))
    .then((rows) => rows[0]);

  return {
    total: decimalNormalize(String(result?.total ?? "0")),
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
      sql`${EFFECTIVE_DATE} < ${decoded.entryDate}`,
      and(
        sql`${EFFECTIVE_DATE} = ${decoded.entryDate}`,
        lt(sourceDocuments.createdAt, decoded.createdAt)
      ),
      and(
        sql`${EFFECTIVE_DATE} = ${decoded.entryDate}`,
        eq(sourceDocuments.createdAt, decoded.createdAt),
        sql`${sourceDocuments.id} < ${decoded.id}`
      )
    ) ?? null
  );
}

function encodeCursor(row: SourceDocumentRow): string {
  const effectiveDate = row.entryDate ?? row.createdAt.toISOString().slice(0, 10);
  return `${effectiveDate}|${row.createdAt.toISOString()}|${row.id}`;
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
  revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>
): SourceDocumentStatusType {
  // A document with both an active revision and a completed pending revision -> candidate_pending
  if (row.activeRevisionId != null && row.pendingRevisionId != null) {
    const pendingOutcome = revisions.get(row.pendingRevisionId)?.outcome;
    if (pendingOutcome === "completed") {
      return "candidate_pending";
    }
  }

  const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const outcome = revisionId == null ? null : revisions.get(revisionId)?.outcome;
  if (
    outcome === "processing" ||
    outcome === "completed" ||
    outcome === "anomaly" ||
    outcome === "failed" ||
    outcome === "cancelled"
  ) {
    return outcome;
  }
  throw new Error(`Source document ${row.id} has no readable current revision`);
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

function mapListItem(
  row: SourceDocumentRow,
  revisions: ReadonlyMap<string, typeof sourceDocumentRevisions.$inferSelect>,
  files: ReadonlyMap<string, readonly SourceDocumentStoredFileDto[]>
): SourceDocumentListItemDto {
  const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const revision = revisionId == null ? null : revisions.get(revisionId);
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: row.title,
    text: null,
    files: [],
    status: statusForRow(row, revisions),
    type: row.type,
    anomalyReason: revision?.anomalyReason ?? null,
    entryDate: row.entryDate,
    metadata: {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: null,
    hasImages: (files.get(row.id)?.length ?? 0) > 0,
    supportedActions: [
      ...supportedSourceDocumentActions({
        activeRevisionId: row.activeRevisionId,
        pendingOutcome:
          row.pendingRevisionId == null ? null : ((revision?.outcome as RevisionOutcome) ?? null),
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
    .orderBy(desc(EFFECTIVE_DATE), desc(sourceDocuments.createdAt), desc(sourceDocuments.id))
    .limit(input.limit + 1);
}

export async function listTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  const rows = await fetchRows(input, true);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const [revisions, files] = await Promise.all([loadRevisionFacts(pageRows), loadFiles(pageRows)]);
  const [candidateComparisonMap, activeResultSummaryMap] = await Promise.all([
    loadCandidateComparisonMap(pageRows, revisions),
    loadActiveResultSummaryMap(pageRows, revisions),
  ]);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => {
      const item = mapListItem(row, revisions, files);
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
  const [revisions, files] = await Promise.all([
    loadRevisionFacts(resultRows),
    loadFiles(resultRows),
  ]);
  const [candidateComparisonMap, activeResultSummaryMap] = await Promise.all([
    loadCandidateComparisonMap(resultRows, revisions),
    loadActiveResultSummaryMap(resultRows, revisions),
  ]);
  return {
    items: resultRows.map((row) => {
      const item = mapListItem(row, revisions, files);
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
      return item;
    }),
    hasMore,
    total: Number(countRow?.count ?? 0),
  };
}

/**
 * Lightweight aggregation that returns the processing count
 * and attention count (candidate_pending + anomaly + failed) for a ledger.
 * Uses the same derived status expression as list/collect queries but
 * performs a single-pass aggregate without fetching rows.
 */
export async function countSourceDocumentsByStatus(ledgerId: string): Promise<{
  processingCount: number;
  attentionCount: number;
}> {
  const derivedStatus = derivedStatusExpression();
  const result = await db
    .select({
      processingCount: sql<number>`COUNT(*) FILTER (WHERE ${derivedStatus} = 'processing')`,
      attentionCount: sql<number>`COUNT(*) FILTER (WHERE ${derivedStatus} IN ('candidate_pending', 'anomaly', 'failed'))`,
    })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt),
        sql`${derivedStatus} IS NOT NULL`
      )
    )
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
      isNull(sourceDocuments.deletedAt),
      sql`${derivedStatusExpression()} IS NOT NULL`
    ),
  });
  if (row == null) return null;
  const [revisions, filesByDocument] = await Promise.all([
    loadRevisionFacts([row]),
    loadFiles([row]),
  ]);
  const selectedRevisionId = row.pendingRevisionId ?? row.activeRevisionId;
  const selectedRevision =
    selectedRevisionId == null ? null : (revisions.get(selectedRevisionId) ?? null);
  const files = filesByDocument.get(row.id) ?? [];
  const {
    visionDescription: _visionDescription,
    visionUnderstanding: _visionUnderstanding,
    originalImageUrls: _originalImageUrls,
    ...metadata
  } = row.metadata ?? {};
  const status = statusForRow(row, revisions);

  // Load active result summary for anomaly/failed documents with an active revision
  let activeResultSummary: SourceDocumentCandidateProjectionSummary | undefined;
  if ((status === "anomaly" || status === "failed") && row.activeRevisionId != null) {
    const summaryMap = await loadActiveResultSummaryMap([row], revisions);
    activeResultSummary = summaryMap.get(row.id);
  }

  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: row.title,
    text: selectedRevision?.submittedText ?? null,
    files,
    status,
    type: row.type,
    anomalyReason: selectedRevision?.anomalyReason ?? null,
    entryDate: row.entryDate,
    metadata,
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
      }),
    ],
    errorCode: sanitizedErrorCode(selectedRevision?.outcome, selectedRevision?.failureCode),
    pendingRevisionId: row.pendingRevisionId,
    ...(activeResultSummary !== undefined ? { activeResultSummary } : {}),
  };
}
