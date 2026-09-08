import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerEntries, revisionFiles } from "@/persistence";
import type { DuplicateCandidateContract } from "@/modules/source-document/application/duplicate-detection";

const MAX_CANDIDATES = 200;

interface CandidateRow {
  id: string;
  title: string | null;
  entryDate: string | null;
  createdAt: Date | string;
  matchedRevisionId: string;
}

interface EntryRow {
  revisionId: string;
  itemName: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  convertedAmount: string | null;
}

/**
 * Lists successfully projected AI documents in the same ledger/day that could
 * be duplicates of a parsed document. Only documents that are already
 * confirmed completed may serve as a match baseline: a pending duplicate
 * (or any other unconfirmed document) can never become the basis of another
 * duplicate verdict, which prevents C→B→A duplicate chains. Manual documents
 * and retry revisions of the same document are excluded.
 */
export async function listDuplicateDetectionCandidates(
  ledgerId: string,
  entryDate: string,
  excludeSourceDocumentId: string
): Promise<DuplicateCandidateContract[]> {
  const rows = await db.execute<CandidateRow & Record<string, unknown>>(sql`
    SELECT documents.id, documents.title, documents.entry_date AS "entryDate",
      documents.created_at AS "createdAt",
      COALESCE(documents.active_revision_id, documents.pending_revision_id) AS "matchedRevisionId"
    FROM source_documents documents
    WHERE documents.ledger_id = ${ledgerId}
      AND documents.deleted_at IS NULL
      AND documents.entry_date = ${entryDate}::date
      AND documents.type = 'ai_parsed'
      AND documents.current_status = 'completed'
      AND documents.id <> ${excludeSourceDocumentId}
    ORDER BY documents.created_at DESC, documents.id DESC
    LIMIT ${MAX_CANDIDATES}
  `);

  const candidates = rows.rows.map((row) => ({
    sourceDocumentId: row.id,
    title: row.title,
    entryDate: row.entryDate,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
    matchedRevisionId: row.matchedRevisionId,
  }));
  if (candidates.length === 0) return [];

  const revisionIds = candidates.map((candidate) => candidate.matchedRevisionId);
  const [entryRows, fileRows] = await Promise.all([
    db
      .select({
        revisionId: ledgerEntries.sourceDocumentRevisionId,
        itemName: ledgerEntries.itemName,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        categoryId: ledgerEntries.categoryId,
        convertedAmount: ledgerEntries.convertedAmount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          inArray(ledgerEntries.sourceDocumentRevisionId, revisionIds),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(asc(ledgerEntries.sourceDocumentRevisionId), asc(ledgerEntries.position)),
    db
      .select({
        revisionId: revisionFiles.revisionId,
        storedFileId: revisionFiles.storedFileId,
      })
      .from(revisionFiles)
      .where(
        and(eq(revisionFiles.ledgerId, ledgerId), inArray(revisionFiles.revisionId, revisionIds))
      )
      .orderBy(asc(revisionFiles.revisionId), asc(revisionFiles.position)),
  ]);

  const entriesByRevision = new Map<string, EntryRow[]>();
  for (const row of entryRows.filter((entry): entry is EntryRow => entry.revisionId != null)) {
    const group = entriesByRevision.get(row.revisionId) ?? [];
    group.push(row);
    entriesByRevision.set(row.revisionId, group);
  }
  const filesByRevision = new Map<string, string[]>();
  for (const row of fileRows) {
    const group = filesByRevision.get(row.revisionId) ?? [];
    group.push(row.storedFileId);
    filesByRevision.set(row.revisionId, group);
  }

  return candidates.map((candidate) => ({
    sourceDocumentId: candidate.sourceDocumentId,
    title: candidate.title,
    entryDate: candidate.entryDate,
    createdAt: candidate.createdAt,
    matchedRevisionId: candidate.matchedRevisionId,
    entries: (entriesByRevision.get(candidate.matchedRevisionId) ?? []).map((entry) => ({
      itemName: entry.itemName,
      amount: entry.amount,
      currency: entry.currency,
      categoryId: entry.categoryId,
      convertedAmount: entry.convertedAmount,
    })),
    storedFileIds: filesByRevision.get(candidate.matchedRevisionId) ?? [],
  }));
}
