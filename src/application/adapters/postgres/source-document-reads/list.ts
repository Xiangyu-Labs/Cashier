import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db";
import type {
  SourceDocumentDto,
  SourceDocumentCandidateReviewDto,
  SourceDocumentCandidateReviewEntryDto,
} from "@/modules/source-document/contracts";
import { add as decimalAdd } from "@/lib/money/decimal";
import {
  entryCategories,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { ConflictError, NotFoundError } from "@/lib/errors";
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
      submittedText: sourceDocumentRevisions.submittedText,
      revisionOutcome: sourceDocumentRevisions.outcome,
      invalidReason: sourceDocumentRevisions.invalidReason,
      failureCode: sourceDocumentRevisions.failureCode,
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

  const selectedEntries =
    baseRow.selectedRevisionId == null
      ? []
      : (entriesByRevision.get(baseRow.selectedRevisionId) ?? []);
  const activeEntries =
    baseRow.activeRevisionId == null ? [] : (entriesByRevision.get(baseRow.activeRevisionId) ?? []);
  const hydration: SourceDocumentHydrationRow = {
    documentId: baseRow.documentId,
    selectedRevisionId: baseRow.selectedRevisionId,
    activeRevisionId: baseRow.activeRevisionId,
    revisionTitle: baseRow.revisionTitle,
    submittedText: baseRow.submittedText,
    revisionOutcome: baseRow.revisionOutcome,
    invalidReason: baseRow.invalidReason,
    failureCode: baseRow.failureCode,
    hasImages: fileRows.length > 0,
    files: fileRows,
    ledgerEntries: selectedEntries,
    activeResultSummary:
      (baseRow.revisionOutcome === "invalid" || baseRow.revisionOutcome === "failed") &&
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
      submittedText: sourceDocumentRevisions.submittedText,
      revisionOutcome: sourceDocumentRevisions.outcome,
      invalidReason: sourceDocumentRevisions.invalidReason,
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
        submittedText: row.submittedText,
        revisionOutcome: row.revisionOutcome,
        invalidReason: row.invalidReason,
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
): Promise<SourceDocumentDto | null> {
  return db.transaction((tx) => getSourceDocumentInTransaction(tx, ledgerId, sourceDocumentId), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export async function getSourceDocumentInTransaction(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentDto | null> {
  const snapshot = await loadSourceDocumentDetailSnapshot(tx, ledgerId, sourceDocumentId);
  return snapshot == null ? null : mapSourceDocumentDetail(snapshot.row, snapshot.hydration);
}
