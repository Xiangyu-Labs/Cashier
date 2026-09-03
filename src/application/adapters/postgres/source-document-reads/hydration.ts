import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentStoredFileDto,
} from "@/modules/source-document/contracts";
import { ledgerEntries, revisionFiles, storedFiles } from "@/persistence";
import { mapDuplicateReviewEntryDto, mapStoredFileDto } from "./mappers";

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
