import { format } from "date-fns";
import { and, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeEnd, parseDateRangeStart } from "@/lib/date-utils";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/queries";
import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
} from "@/modules/source-document/grouping";
import {
  mapSourceDocumentLedgerEntryDto,
  serializeSourceDocument,
} from "@/modules/source-document/mappers";
import { sourceDocuments } from "@/persistence";
import type {
  PendingSourceDocumentsResponseDto,
  SourceDocumentCollectionDto,
  SourceDocumentDto,
  SourceDocumentFullDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentPageDto,
} from "../../contracts";
import type { SourceDocumentStatusType } from "../../types";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_LIMIT = 1000;

type SourceDocumentRow = typeof sourceDocuments.$inferSelect;

export interface ListSourceDocumentsParams {
  status?: string | null;
  limit?: number;
  cursor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  includeLedgerEntries?: boolean;
}

export interface ListAllSourceDocumentsParams {
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
}

function buildStatusCondition(status: string | null | undefined): SQL<unknown> | null {
  if (status == null || status === "") return null;

  const statuses = status.split(",").filter(Boolean);
  if (statuses.length === 0) return null;

  return inArray(sourceDocuments.status, statuses as SourceDocumentStatusType[]);
}

function buildDateConditions(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (startDate != null && startDate !== "") {
    const parsedStart = parseDateRangeStart(startDate);
    if (parsedStart != null) {
      conditions.push(gte(sourceDocuments.entryDate, format(parsedStart, "yyyy-MM-dd")));
    }
  }

  if (endDate != null && endDate !== "") {
    const parsedEnd = parseDateRangeEnd(endDate);
    if (parsedEnd != null) {
      conditions.push(lte(sourceDocuments.entryDate, format(parsedEnd, "yyyy-MM-dd")));
    }
  }

  return conditions;
}

function buildCursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
  if (cursor == null || cursor === "") return null;

  const parts = cursor.split("|");

  if (parts.length === 3) {
    const cursorDate = parts[0];
    const cursorCreatedRaw = parts[1];
    const cursorId = parts[2];

    if (
      cursorDate == null ||
      cursorDate === "" ||
      cursorCreatedRaw == null ||
      cursorCreatedRaw === "" ||
      cursorId == null ||
      cursorId === ""
    ) {
      return null;
    }

    const cursorCreated = new Date(cursorCreatedRaw);
    if (Number.isNaN(cursorCreated.getTime())) {
      return null;
    }

    return (
      or(
        lt(sourceDocuments.entryDate, cursorDate),
        and(eq(sourceDocuments.entryDate, cursorDate), lt(sourceDocuments.createdAt, cursorCreated)),
        and(
          eq(sourceDocuments.entryDate, cursorDate),
          eq(sourceDocuments.createdAt, cursorCreated),
          lt(sourceDocuments.id, cursorId)
        )
      ) ?? null
    );
  }

  if (parts.length === 2) {
    const cursorCreatedRaw = parts[0];
    const cursorId = parts[1];

    if (
      cursorCreatedRaw == null ||
      cursorCreatedRaw === "" ||
      cursorId == null ||
      cursorId === ""
    ) {
      return null;
    }

    const cursorCreated = new Date(cursorCreatedRaw);
    if (Number.isNaN(cursorCreated.getTime())) {
      return null;
    }

    return (
      or(
        lt(sourceDocuments.createdAt, cursorCreated),
        and(eq(sourceDocuments.createdAt, cursorCreated), lt(sourceDocuments.id, cursorId))
      ) ?? null
    );
  }

  return null;
}

function generateNextCursor(lastItem: SourceDocumentRow): string {
  const nextDate = lastItem.entryDate ?? "0000-00-00";
  return `${nextDate}|${lastItem.createdAt.toISOString()}|${lastItem.id}`;
}

async function listEntriesBySourceDocumentIds(
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

function serializeSourceDocumentByStatus(
  document: SourceDocumentRow,
  includeEntries: boolean,
  entriesByDocId: Map<string, SourceDocumentLedgerEntryDto[]>
): SourceDocumentDto {
  const isActiveDocument =
    document.status === "queued" ||
    document.status === "processing" ||
    document.status === "anomaly" ||
    document.status === "failed";

  const serializeOptions = {
    stripMetadataFields: ["visionDescription", "originalImageUrls"],
    includeHasImages: !isActiveDocument,
    ...(isActiveDocument ? {} : { imageUrlsOverride: [] }),
    ...(includeEntries ? { ledgerEntries: entriesByDocId.get(document.id) ?? [] } : {}),
  };

  return serializeSourceDocument(document, serializeOptions);
}

function serializeSourceDocumentFlat(
  document: SourceDocumentRow,
  entriesByDocId: Map<string, SourceDocumentLedgerEntryDto[]>
): SourceDocumentDto {
  return {
    id: document.id,
    ledgerId: document.ledgerId,
    title: document.title,
    text: null,
    imageUrls: [],
    status: document.status,
    type: document.type,
    anomalyReason: document.anomalyReason,
    entryDate: document.entryDate,
    metadata: {},
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
    ledgerEntries: entriesByDocId.get(document.id) ?? [],
    hasImages: (document.imageUrls?.length ?? 0) > 0,
  };
}

export async function listSourceDocumentsQuery(
  ledgerId: string,
  params: ListSourceDocumentsParams
): Promise<SourceDocumentPageDto> {
  const { status, limit = 20, startDate, endDate, cursor, includeLedgerEntries } = params;
  const q = forLedger(sourceDocuments, ledgerId);

  const conditions = [
    q.whereActive,
    buildStatusCondition(status),
    ...buildDateConditions(startDate, endDate),
    buildCursorCondition(cursor),
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
  const nextCursor = nextCursorItem != null ? generateNextCursor(nextCursorItem) : null;

  const entriesByDocId =
    includeLedgerEntries === true
      ? await listEntriesBySourceDocumentIds(
          ledgerId,
          resultItems.map((item) => item.id)
        )
      : new Map<string, SourceDocumentLedgerEntryDto[]>();

  return {
    items: resultItems.map((item) =>
      serializeSourceDocumentByStatus(item, includeLedgerEntries === true, entriesByDocId)
    ),
    nextCursor,
  };
}

export async function listAllSourceDocumentsQuery(
  ledgerId: string,
  params: ListAllSourceDocumentsParams = {}
): Promise<SourceDocumentCollectionDto> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize =
    params.page != null
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE))
      : DEFAULT_PAGE_LIMIT;
  const offset = (page - 1) * pageSize;

  const q = forLedger(sourceDocuments, ledgerId);
  const conditions = [q.whereActive, ...buildDateConditions(params.startDate, params.endDate)];

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sourceDocuments)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count) ?? 0;

  const queryLimit = params.page != null ? pageSize + 1 : pageSize;
  const rows = await db.query.sourceDocuments.findMany({
    where: and(...conditions),
    orderBy: [
      desc(sourceDocuments.entryDate),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id),
    ],
    limit: queryLimit,
    offset: params.page != null ? offset : 0,
  });

  const hasMore = params.page != null ? rows.length > pageSize : false;
  const resultItems = hasMore ? rows.slice(0, pageSize) : rows;
  const entriesByDocId = await listEntriesBySourceDocumentIds(
    ledgerId,
    resultItems.map((item) => item.id)
  );

  return {
    items: resultItems.map((item) => serializeSourceDocumentFlat(item, entriesByDocId)),
    hasMore,
    total,
  };
}

export async function getPendingSourceDocumentsQuery(
  ledgerId: string
): Promise<PendingSourceDocumentsResponseDto> {
  const result = await listSourceDocumentsQuery(ledgerId, {
    status: "queued,processing,anomaly,failed",
    includeLedgerEntries: true,
  });

  const typedItems = result.items.map((document) => ({
    ...document,
    ledgerEntries: document.ledgerEntries ?? [],
  }));
  const groups = groupPendingSourceDocuments(typedItems);
  const stats = calculateSourceDocumentStats(groups);

  return {
    groups,
    stats: {
      ...stats,
      total: calculatePendingTotal(groups),
    },
  };
}

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto | null> {
  const q = forLedger(sourceDocuments, ledgerId);
  const document = await db.query.sourceDocuments.findFirst({
    where: q.whereId(sourceDocumentId),
  });

  if (document == null) {
    return null;
  }

  return {
    id: document.id,
    text: document.text,
    imageUrls: document.imageUrls ?? [],
    status: document.status,
    createdAt: document.createdAt.toISOString(),
  };
}

export const sourceDocumentPaginationConfig = {
  DEFAULT_PAGE_LIMIT,
};
