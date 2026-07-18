import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentStoredFileDto,
  SourceDocumentDto,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import {
  PROCESSING_FAILURE_CODES,
  supportedSourceDocumentActions,
  type ApplicationErrorCode,
  type RevisionOutcome,
} from "@/application/contracts";
import {
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";

const EMPTY_DATE_SORT_KEY = "0000-00-00";

export interface TargetSourceDocumentListInput {
  ledgerId: string;
  statuses?: readonly SourceDocumentStatusType[];
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
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

function baseConditions(input: TargetSourceDocumentListInput): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(sourceDocuments.ledgerId, input.ledgerId),
    isNull(sourceDocuments.deletedAt),
    sql`${derivedStatusExpression()} IS NOT NULL`,
  ];

  if (input.statuses != null && input.statuses.length > 0) {
    conditions.push(inArray(derivedStatusExpression(), [...input.statuses]));
  }
  if (input.startDate != null && input.startDate !== "") {
    conditions.push(
      sql`COALESCE(${sourceDocuments.entryDate}, ${EMPTY_DATE_SORT_KEY}) >= ${input.startDate}`
    );
  }
  if (input.endDate != null && input.endDate !== "") {
    conditions.push(
      sql`COALESCE(${sourceDocuments.entryDate}, ${EMPTY_DATE_SORT_KEY}) <= ${input.endDate}`
    );
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
  return conditions;
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
  const entryDate = sql<string>`COALESCE(${sourceDocuments.entryDate}, ${EMPTY_DATE_SORT_KEY})`;
  return (
    or(
      sql`${entryDate} < ${decoded.entryDate}`,
      and(
        sql`${entryDate} = ${decoded.entryDate}`,
        lt(sourceDocuments.createdAt, decoded.createdAt)
      ),
      and(
        sql`${entryDate} = ${decoded.entryDate}`,
        eq(sourceDocuments.createdAt, decoded.createdAt),
        sql`${sourceDocuments.id} < ${decoded.id}`
      )
    ) ?? null
  );
}

function encodeCursor(row: SourceDocumentRow): string {
  return `${row.entryDate ?? EMPTY_DATE_SORT_KEY}|${row.createdAt.toISOString()}|${row.id}`;
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
    outcome === "queued" ||
    outcome === "processing" ||
    outcome === "completed" ||
    outcome === "anomaly" ||
    outcome === "failed"
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

function sanitizedErrorCode(
  outcome: string | undefined,
  failureCode: string | null | undefined
): ApplicationErrorCode | null {
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
      desc(sql`COALESCE(${sourceDocuments.entryDate}, ${EMPTY_DATE_SORT_KEY})`),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id)
    )
    .limit(input.limit + 1);
}

export async function listTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  const rows = await fetchRows(input, true);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const [revisions, files] = await Promise.all([loadRevisionFacts(pageRows), loadFiles(pageRows)]);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => mapListItem(row, revisions, files)),
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
  return {
    items: resultRows.map((row) => mapListItem(row, revisions, files)),
    hasMore,
    total: Number(countRow?.count ?? 0),
  };
}

/**
 * Lightweight aggregation that returns processing count (queued + processing)
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
      processingCount: sql<number>`COUNT(*) FILTER (WHERE ${derivedStatus} IN ('queued', 'processing'))`,
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
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: row.title,
    text: selectedRevision?.submittedText ?? null,
    files,
    status: statusForRow(row, revisions),
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
  };
}
