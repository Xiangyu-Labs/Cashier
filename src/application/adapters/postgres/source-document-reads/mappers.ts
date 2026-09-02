import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentStoredFileDto,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
  SourceDocumentCandidateComparisonDto,
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
import {
  duplicateReviews,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";

function parseAmount(amount: string | null | undefined): number {
  if (amount == null) return 0;
  const parsed = parseFloat(amount);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function loadDuplicateReviewMap(
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

export async function loadDuplicateReviewSide(
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

export type SourceDocumentRow = typeof sourceDocuments.$inferSelect;

export async function loadRevisionFacts(rows: readonly SourceDocumentRow[]) {
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

export function statusForRow(
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

export async function loadFileData(
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
    .innerJoin(
      storedFiles,
      and(
        eq(storedFiles.id, revisionFiles.storedFileId),
        eq(storedFiles.ledgerId, revisionFiles.ledgerId),
        isNull(storedFiles.deletedAt)
      )
    )
    .where(inArray(revisionFiles.revisionId, [...selected.keys()]));
  const revisionIds = new Set(revisionsWithFiles.map((row) => row.revisionId));
  const hasImages = new Map<string, boolean>();
  for (const [revisionId, documentId] of selected) {
    if (revisionIds.has(revisionId)) hasImages.set(documentId, true);
  }
  return { files: new Map(), hasImages };
}

export function mapListItem(
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

export async function loadActiveResultSummaryMap(
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

export async function loadCandidateComparisonMap(
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
