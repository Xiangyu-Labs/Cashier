import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentCandidateProjectionSummary,
  SourceDocumentDuplicateReviewDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentStoredFileDto,
} from "@/modules/source-document/contracts";
import {
  duplicateReviews,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  storedFiles,
} from "@/persistence";
import {
  mapDuplicateReviewDto,
  mapDuplicateReviewEntryDto,
  mapStoredFileDto,
  summarizeProjection,
  type SourceDocumentRow,
} from "./mappers";

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
        inArray(duplicateReviews.sourceDocumentId, ids),
        eq(duplicateReviews.status, "pending")
      )
    );
  return new Map(reviews.map((review) => [review.sourceDocumentId, mapDuplicateReviewDto(review)]));
}

async function loadRevisionFileMap(
  ledgerId: string,
  revisionIds: readonly string[]
): Promise<Map<string, SourceDocumentStoredFileDto[]>> {
  const ids = [...new Set(revisionIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
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
        eq(storedFiles.id, revisionFiles.storedFileId),
        eq(storedFiles.ledgerId, revisionFiles.ledgerId),
        isNull(storedFiles.deletedAt)
      )
    )
    .where(and(eq(revisionFiles.ledgerId, ledgerId), inArray(revisionFiles.revisionId, ids)))
    .orderBy(asc(revisionFiles.revisionId), asc(revisionFiles.position));

  const result = new Map<string, SourceDocumentStoredFileDto[]>();
  for (const row of rows) {
    const files = result.get(row.revisionId) ?? [];
    files.push(mapStoredFileDto(row));
    result.set(row.revisionId, files);
  }
  return result;
}

export async function hasRevisionFiles(ledgerId: string, revisionId: string): Promise<boolean> {
  return (await loadRevisionFileMap(ledgerId, [revisionId])).has(revisionId);
}

export async function loadDuplicateReviewSide(
  ledgerId: string,
  revisionId: string,
  options: { includeDeletedEntries?: boolean } = {}
): Promise<{ entries: SourceDocumentLedgerEntryDto[]; files: SourceDocumentStoredFileDto[] }> {
  const [entries, filesByRevision] = await Promise.all([
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
    loadRevisionFileMap(ledgerId, [revisionId]),
  ]);
  return {
    entries: entries.map((entry) => mapDuplicateReviewEntryDto(entry, ledgerId)),
    files: filesByRevision.get(revisionId) ?? [],
  };
}

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

export async function loadFileData(
  rows: readonly SourceDocumentRow[],
  includeFiles: boolean
): Promise<{
  files: Map<string, SourceDocumentStoredFileDto[]>;
  hasImages: Map<string, boolean>;
}> {
  const selected = new Map(
    rows.flatMap((row) => {
      const revisionId = row.pendingRevisionId ?? row.activeRevisionId;
      return revisionId == null ? [] : ([[revisionId, row.id]] as const);
    })
  );
  const filesByRevision = await loadRevisionFileMap(rows[0]?.ledgerId ?? "", [...selected.keys()]);
  const files = new Map<string, SourceDocumentStoredFileDto[]>();
  const hasImages = new Map<string, boolean>();
  for (const [revisionId, documentId] of selected) {
    const revisionFiles = filesByRevision.get(revisionId) ?? [];
    if (revisionFiles.length > 0) hasImages.set(documentId, true);
    if (includeFiles) files.set(documentId, revisionFiles);
  }
  return { files, hasImages };
}

export async function loadActiveResultSummaryMap(
  rows: readonly SourceDocumentRow[]
): Promise<Map<string, SourceDocumentCandidateProjectionSummary>> {
  const targets = rows.filter(
    (row) =>
      row.activeRevisionId != null &&
      (row.currentStatus === "anomaly" || row.currentStatus === "failed")
  );
  if (targets.length === 0) return new Map();
  const revisionIds = targets.map((row) => row.activeRevisionId!);
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
        inArray(ledgerEntries.sourceDocumentRevisionId, revisionIds),
        isNull(ledgerEntries.deletedAt)
      )
    );
  const entriesByRevision = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.revisionId == null) continue;
    const group = entriesByRevision.get(entry.revisionId) ?? [];
    group.push(entry);
    entriesByRevision.set(entry.revisionId, group);
  }
  return new Map(
    targets.map((row) => [
      row.id,
      summarizeProjection(entriesByRevision.get(row.activeRevisionId!) ?? []),
    ])
  );
}
