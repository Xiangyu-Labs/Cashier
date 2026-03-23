import { and, desc, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import {
  mapSourceDocumentListItemDto,
  mapSourceDocumentLedgerEntryDto,
} from "@/modules/source-document/mappers";
import { whereSourceDocumentNotDeleted } from "@/modules/source-document/application/source-document-state";
import {
  type ListSourceDocumentsInput,
  type ListSourceDocumentsValidatedInput,
  parseListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import { sourceDocuments } from "@/persistence";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
} from "../../contracts";
import {
  buildSourceDocumentCursorCondition,
  generateSourceDocumentNextCursor,
} from "./source-document-query-cursor";
import { buildSourceDocumentDateConditions } from "./source-document-query-date";
import { buildSourceDocumentStatusCondition } from "./source-document-query-status";

type SourceDocumentRow = typeof sourceDocuments.$inferSelect;

export interface ListSourceDocumentsParams {
  status?: string | null;
  limit?: number;
  cursor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  includeLedgerEntries?: boolean;
}

export async function listEntriesBySourceDocumentIds(
  ledgerId: string,
  sourceDocumentIds: string[]
): Promise<Map<string, SourceDocumentLedgerEntryDto[]>> {
  if (sourceDocumentIds.length === 0) {
    return new Map<string, SourceDocumentLedgerEntryDto[]>();
  }

  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId,
    sourceDocumentIds,
  });

  const mapped = new Map<string, SourceDocumentLedgerEntryDto[]>();
  for (const [docId, entries] of entriesByDocId.entries()) {
    mapped.set(
      docId,
      entries.map((entry) => mapSourceDocumentLedgerEntryDto(entry))
    );
  }

  return mapped;
}

export function serializeSourceDocumentListItem(
  document: SourceDocumentRow,
  ledgerEntries?: SourceDocumentLedgerEntryDto[]
): SourceDocumentListItemDto {
  return mapSourceDocumentListItemDto(document, ledgerEntries);
}

export async function listSourceDocumentsQuery(
  ledgerId: string,
  params: ListSourceDocumentsParams
): Promise<SourceDocumentPageDto> {
  const { status, limit = 20, startDate, endDate, cursor, includeLedgerEntries } = params;

  const conditions = [
    whereSourceDocumentNotDeleted(ledgerId),
    buildSourceDocumentStatusCondition(status),
    ...buildSourceDocumentDateConditions(startDate, endDate),
    buildSourceDocumentCursorCondition(cursor),
  ].filter((condition): condition is SQL<unknown> => condition !== null);

  const items = await db.query.sourceDocuments.findMany({
    where: and(...conditions),
    orderBy: [
      desc(sourceDocuments.entryDate),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id),
    ],
    limit: limit + 1,
  });

  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const nextCursorItem = hasMore ? items[limit] : undefined;
  const nextCursor =
    nextCursorItem != null ? generateSourceDocumentNextCursor(nextCursorItem) : null;

  const entriesByDocId =
    includeLedgerEntries === true
      ? await listEntriesBySourceDocumentIds(
          ledgerId,
          resultItems.map((item) => item.id)
        )
      : new Map<string, SourceDocumentLedgerEntryDto[]>();

  return {
    items: resultItems.map((item) =>
      serializeSourceDocumentListItem(
        item,
        includeLedgerEntries === true ? (entriesByDocId.get(item.id) ?? []) : undefined
      )
    ),
    nextCursor,
  };
}

export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  const validated = parseListSourceDocumentsInput(params);
  return listSourceDocumentsFromValidatedInput(ledgerId, validated);
}

export async function listSourceDocumentsFromValidatedInput(
  ledgerId: string,
  validated: ListSourceDocumentsValidatedInput
): Promise<SourceDocumentPageDto> {
  return listSourceDocumentsQuery(ledgerId, {
    status: validated.status ?? null,
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    cursor: validated.cursor ?? null,
    limit: validated.limit,
    includeLedgerEntries: validated.includeEntries,
  });
}
