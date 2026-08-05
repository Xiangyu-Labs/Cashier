import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { mapLedgerEntryDto } from "./mappers";
import {
  buildLedgerEntryCursorCondition,
  buildLedgerEntryFilterConditions,
  encodeLedgerEntryCursor,
  ledgerEntryOrderingExpressions,
  type LedgerEntryFilterParams,
} from "./build-ledger-entry-filters";
import { ledgerEntries, revisionFiles, sourceDocuments } from "@/persistence";

interface ListLedgerEntryPageInput {
  ledgerId: string;
  limit?: number;
  cursor?: string | null;
  filters: LedgerEntryFilterParams;
}

export async function listLedgerEntryPage({
  ledgerId,
  limit = 20,
  cursor,
  filters,
}: ListLedgerEntryPageInput) {
  const conditions = buildLedgerEntryFilterConditions(ledgerId, filters);
  const cursorCondition = buildLedgerEntryCursorCondition(cursor, ledgerId, filters);
  if (cursorCondition != null) {
    conditions.push(cursorCondition);
  }

  const hasEntryFilters =
    filters.uncategorizedOnly === true ||
    (filters.categoryId != null && filters.categoryId !== "") ||
    (filters.currency != null && filters.currency !== "") ||
    filters.minAmount != null ||
    filters.maxAmount != null ||
    (filters.search != null && filters.search !== "");
  const optimizedIds =
    cursor == null && !hasEntryFilters
      ? await db.execute<{ id: string }>(sql`
          SELECT entry.id
          FROM ${sourceDocuments} document
          CROSS JOIN LATERAL (
            SELECT candidate.id, candidate.position
            FROM ${ledgerEntries} candidate
            WHERE candidate.ledger_id = document.ledger_id
              AND candidate.source_document_id = document.id
              AND candidate.source_document_revision_id = document.active_revision_id
              AND candidate.deleted_at IS NULL
            ORDER BY candidate.position ASC, candidate.id ASC
            OFFSET 0
          ) entry
          WHERE document.ledger_id = ${ledgerId}
            AND document.deleted_at IS NULL
            AND document.active_revision_id IS NOT NULL
            ${
              filters.startDate != null && filters.startDate !== ""
                ? sql`AND document.effective_date >= ${filters.startDate}::date`
                : sql``
            }
            ${
              filters.endDate != null && filters.endDate !== ""
                ? sql`AND document.effective_date <= ${filters.endDate}::date`
                : sql``
            }
          ORDER BY document.effective_date DESC, document.created_at DESC, document.id DESC,
            entry.position ASC, entry.id ASC
          LIMIT ${limit + 1}
        `)
      : null;
  const optimizedOrder = new Map((optimizedIds?.rows ?? []).map((row, index) => [row.id, index]));
  const rows = await db.query.ledgerEntries
    .findMany({
      where: and(...conditions),
      orderBy: (entries) => {
        const ordering = ledgerEntryOrderingExpressions(ledgerId);
        return [
          desc(ordering.effectiveDate),
          desc(ordering.documentCreatedAt),
          desc(entries.sourceDocumentId),
          asc(entries.position),
          asc(entries.id),
        ];
      },
      ...(optimizedIds == null
        ? { limit: limit + 1 }
        : {
            where:
              optimizedIds.rows.length === 0
                ? sql`false`
                : and(
                    eq(ledgerEntries.ledgerId, ledgerId),
                    isNull(ledgerEntries.deletedAt),
                    inArray(
                      ledgerEntries.id,
                      optimizedIds.rows.map((row) => row.id)
                    )
                  ),
          }),
      with: {
        category: true,
        sourceDocument: {
          columns: {
            id: true,
            ledgerId: true,
            title: true,
            currentStatus: true,
            type: true,
            entryDate: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
      },
    })
    .then((found) =>
      optimizedIds == null
        ? found
        : found.toSorted(
            (left, right) =>
              (optimizedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
              (optimizedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
          )
    );

  let nextCursor: string | undefined;
  let pagedRows = rows;
  if (rows.length > limit) {
    pagedRows = rows.slice(0, limit);
    const lastItem = pagedRows.at(-1);
    if (lastItem == null) {
      throw new AppError("Expected next ledger entry page cursor row", "INVARIANT_VIOLATION");
    }
    if (lastItem.sourceDocument == null || lastItem.sourceDocumentId == null) {
      throw new AppError("Expected ledger entry source document", "INVARIANT_VIOLATION");
    }
    nextCursor = encodeLedgerEntryCursor(
      {
        effectiveDate:
          lastItem.sourceDocument.entryDate ??
          lastItem.sourceDocument.createdAt.toISOString().slice(0, 10),
        documentCreatedAt: lastItem.sourceDocument.createdAt.toISOString(),
        documentId: lastItem.sourceDocumentId,
        position: lastItem.position,
        entryId: lastItem.id,
      },
      filters
    );
  }

  const revisionIds = pagedRows.flatMap((row) =>
    row.sourceDocumentRevisionId == null ? [] : [row.sourceDocumentRevisionId]
  );
  const revisionsWithFiles = new Set(
    revisionIds.length === 0
      ? []
      : (
          await db
            .select({ revisionId: revisionFiles.revisionId })
            .from(revisionFiles)
            .where(inArray(revisionFiles.revisionId, revisionIds))
        ).map((row) => row.revisionId)
  );

  const items = pagedRows.map((row) => {
    const dto = mapLedgerEntryDto({
      ...row,
      category: row.category,
      sourceDocument: row.sourceDocument,
    });

    if (dto.sourceDocument != null) {
      dto.sourceDocument = {
        ...dto.sourceDocument,
        hasImages:
          row.sourceDocumentRevisionId != null &&
          revisionsWithFiles.has(row.sourceDocumentRevisionId),
      };
    }

    return dto;
  });

  return {
    items,
    nextCursor,
  };
}
