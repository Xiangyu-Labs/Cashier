import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { SourceDocumentDetailDto } from "@/modules/source-document/contracts";
import { add as decimalAdd } from "@/lib/money/decimal";
import {
  entryCategories,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import type { PostgresTransaction } from "../transaction-locks";

import type { TargetSourceDocumentListInput } from "./filters";
import { baseConditions } from "./filters";
import { cursorCondition, encodeCursor } from "./cursor";
import {
  mapListItem,
  mapSourceDocumentDetail,
  type SourceDocumentLedgerEntryAggregateRow,
  type SourceDocumentHydrationRow,
  type SourceDocumentRow,
  type SourceDocumentStoredFileAggregateRow,
} from "./mappers";

async function loadSourceDocumentDetailSnapshot(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string
): Promise<{ row: SourceDocumentRow; hydration: SourceDocumentHydrationRow } | null> {
  const baseRow = await tx
    .select({
      ...getTableColumns(sourceDocuments),
      documentId: sourceDocuments.id,
      selectedRevisionId: sourceDocumentRevisions.id,
      activeRevisionId: sourceDocuments.activeRevisionId,
      revisionTitle: sourceDocumentRevisions.title,
      inputText: sourceDocumentRevisions.inputText,
      latestSubmissionStatus: sourceDocumentRevisions.processingStatus,
      failureKind: sourceDocumentRevisions.failureKind,
      failureMessage: sourceDocumentRevisions.failureMessage,
      failureCode: sourceDocumentRevisions.failureCode,
    })
    .from(sourceDocuments)
    .leftJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
        eq(sourceDocumentRevisions.id, sourceDocuments.latestSubmissionRevisionId)
      )
    )
    .where(
      and(
        eq(sourceDocuments.ledgerId, ledgerId),
        eq(sourceDocuments.id, sourceDocumentId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .then((rows) => rows[0]);
  if (baseRow == null) return null;

  const fileRows: SourceDocumentStoredFileAggregateRow[] =
    baseRow.selectedRevisionId == null
      ? []
      : await tx
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
              eq(storedFiles.ledgerId, revisionFiles.ledgerId),
              eq(storedFiles.id, revisionFiles.storedFileId),
              isNull(storedFiles.deletedAt)
            )
          )
          .where(
            and(
              eq(revisionFiles.ledgerId, ledgerId),
              eq(revisionFiles.revisionId, baseRow.selectedRevisionId)
            )
          )
          .orderBy(asc(revisionFiles.position));

  const relevantRevisionIds = [baseRow.selectedRevisionId, baseRow.activeRevisionId].filter(
    (id): id is string => id != null
  );
  const entryRows =
    relevantRevisionIds.length === 0
      ? []
      : await tx
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
              eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
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

  const activeEntries =
    baseRow.activeRevisionId == null ? [] : (entriesByRevision.get(baseRow.activeRevisionId) ?? []);
  const hydration: SourceDocumentHydrationRow = {
    documentId: baseRow.documentId,
    selectedRevisionId: baseRow.selectedRevisionId,
    activeRevisionId: baseRow.activeRevisionId,
    revisionTitle: baseRow.revisionTitle,
    inputText: baseRow.inputText,
    processingStatus: baseRow.latestSubmissionStatus,
    failureKind: baseRow.failureKind,
    failureMessage: baseRow.failureMessage,
    failureCode: baseRow.failureCode,
    hasImages: fileRows.length > 0,
    files: fileRows,
    ledgerEntries: activeEntries,
    activeResultSummary:
      baseRow.activeRevisionId != null
        ? {
            entryCount: activeEntries.length,
            total: activeEntries.reduce(
              (sum, entry) => decimalAdd(sum, entry.convertedAmount ?? entry.amount),
              "0"
            ),
          }
        : null,
  };
  return { row: baseRow as SourceDocumentRow, hydration };
}

export async function listTargetSourceDocuments(input: TargetSourceDocumentListInput) {
  const conditions = baseConditions(input);
  const cursor = cursorCondition(input.cursor);
  if (cursor != null) conditions.push(cursor);
  const rows = await db
    .select({
      ...getTableColumns(sourceDocuments),
      documentId: sourceDocuments.id,
      selectedRevisionId: sourceDocumentRevisions.id,
      selectedActiveRevisionId: sourceDocuments.activeRevisionId,
      revisionTitle: sourceDocumentRevisions.title,
      inputText: sourceDocumentRevisions.inputText,
      latestSubmissionStatus: sourceDocumentRevisions.processingStatus,
      failureKind: sourceDocumentRevisions.failureKind,
      failureMessage: sourceDocumentRevisions.failureMessage,
      failureCode: sourceDocumentRevisions.failureCode,
      hasImages: sql<boolean>`EXISTS (
            SELECT 1
            FROM ${revisionFiles} list_revision_file
            INNER JOIN ${storedFiles} list_stored_file
              ON list_stored_file.ledger_id = list_revision_file.ledger_id
             AND list_stored_file.id = list_revision_file.stored_file_id
             AND list_stored_file.deleted_at IS NULL
            WHERE list_revision_file.ledger_id = ${input.ledgerId}
              AND list_revision_file.revision_id = ${sourceDocumentRevisions.id}
          )`,
    })
    .from(sourceDocuments)
    .leftJoin(
      sourceDocumentRevisions,
      and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, sourceDocuments.id),
        eq(sourceDocumentRevisions.id, sourceDocuments.latestSubmissionRevisionId)
      )
    )
    .where(and(...conditions))
    .orderBy(
      desc(sourceDocuments.effectiveDate),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id)
    )
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => {
      const hydration: SourceDocumentHydrationRow = {
        documentId: row.documentId,
        selectedRevisionId: row.selectedRevisionId,
        activeRevisionId: row.selectedActiveRevisionId,
        revisionTitle: row.revisionTitle,
        inputText: row.inputText,
        processingStatus: row.latestSubmissionStatus,
        failureKind: row.failureKind,
        failureMessage: row.failureMessage,
        failureCode: row.failureCode,
        hasImages: row.hasImages,
        files: [],
        ledgerEntries: [],
        activeResultSummary: null,
      };
      return mapListItem(row as SourceDocumentRow, hydration);
    }),
    nextCursor: hasMore && last != null ? encodeCursor(last as SourceDocumentRow) : null,
  };
}

export async function getTargetSourceDocument(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDetailDto | null> {
  return db.transaction((tx) => getSourceDocumentInTransaction(tx, ledgerId, sourceDocumentId), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export async function getSourceDocumentInTransaction(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDetailDto | null> {
  const snapshot = await loadSourceDocumentDetailSnapshot(tx, ledgerId, sourceDocumentId);
  return snapshot == null ? null : mapSourceDocumentDetail(snapshot.row, snapshot.hydration);
}
