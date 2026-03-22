import { format } from "date-fns";
import { and, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeEnd, parseDateRangeStart } from "@/lib/date-utils";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
} from "@/modules/source-document/grouping";
import {
  mapSourceDocumentListItemDto,
  mapSourceDocumentLedgerEntryDto,
} from "@/modules/source-document/mappers";
import {
  listAllSourceDocumentsInputSchema,
  listSourceDocumentsInputSchema,
  type ListAllSourceDocumentsInput,
  type ListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import { sourceDocuments } from "@/persistence";
import type { z } from "zod";
import type {
  PendingSourceDocumentsResponseDto,
  SourceDocumentCollectionDto,
  SourceDocumentFullDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
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
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
}

type ParsedListSourceDocumentsInput = z.output<typeof listSourceDocumentsInputSchema>;
type ParsedListAllSourceDocumentsInput = z.output<typeof listAllSourceDocumentsInputSchema>;

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

function buildAmountConditions(
  ledgerId: string,
  minAmount: number | undefined,
  maxAmount: number | undefined
): SQL<unknown>[] {
  if (minAmount === undefined && maxAmount === undefined) {
    return [];
  }

  const totalAmountSql = sql<number>`COALESCE((
    SELECT SUM(ABS(CAST(COALESCE(converted_amount, amount) AS REAL)))
    FROM ledger_entries
    WHERE ledger_id = ${ledgerId}
      AND source_document_id = ${sourceDocuments.id}
      AND deleted_at IS NULL
  ), 0)`;

  const conditions: SQL<unknown>[] = [];
  if (minAmount !== undefined) {
    conditions.push(sql`${totalAmountSql} >= ${minAmount}`);
  }
  if (maxAmount !== undefined) {
    conditions.push(sql`${totalAmountSql} <= ${maxAmount}`);
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
        and(
          eq(sourceDocuments.entryDate, cursorDate),
          lt(sourceDocuments.createdAt, cursorCreated)
        ),
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

function serializeSourceDocumentListItem(
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
  const parsed = listSourceDocumentsInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  return listSourceDocumentsFromValidatedInput(ledgerId, parsed.data);
}

export async function listSourceDocumentsFromValidatedInput(
  ledgerId: string,
  validated: ParsedListSourceDocumentsInput
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
  const conditions = [
    q.whereActive,
    ...buildDateConditions(params.startDate, params.endDate),
    ...buildAmountConditions(ledgerId, params.minAmount, params.maxAmount),
  ];

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
    items: resultItems.map((item) =>
      serializeSourceDocumentListItem(item, entriesByDocId.get(item.id) ?? [])
    ),
    hasMore,
    total,
  };
}

export async function getAllSourceDocuments(
  ledgerId: string,
  params: ListAllSourceDocumentsInput = {}
): Promise<SourceDocumentCollectionDto> {
  const parsed = listAllSourceDocumentsInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  return getAllSourceDocumentsFromValidatedInput(ledgerId, parsed.data);
}

export async function getAllSourceDocumentsFromValidatedInput(
  ledgerId: string,
  validated: ParsedListAllSourceDocumentsInput
): Promise<SourceDocumentCollectionDto> {
  const queryParams: ListAllSourceDocumentsParams = {
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    ...(validated.minAmount !== undefined ? { minAmount: validated.minAmount } : {}),
    ...(validated.maxAmount !== undefined ? { maxAmount: validated.maxAmount } : {}),
    ...(validated.page !== undefined ? { page: validated.page } : {}),
    ...(validated.pageSize !== undefined ? { pageSize: validated.pageSize } : {}),
  };

  const result = await listAllSourceDocumentsQuery(ledgerId, queryParams);

  if (queryParams.page == null && result.items.length === DEFAULT_PAGE_LIMIT) {
    logger.warn(
      {
        ledgerId,
        limit: DEFAULT_PAGE_LIMIT,
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
      },
      "getAllSourceDocuments hit result limit - consider using cursor pagination"
    );
  }

  return result;
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

export async function getPendingSourceDocuments(
  ledgerId: string
): Promise<PendingSourceDocumentsResponseDto> {
  return getPendingSourceDocumentsQuery(ledgerId);
}

export async function getSourceDocumentFullQuery(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  const q = forLedger(sourceDocuments, ledgerId);
  const document = await db.query.sourceDocuments.findFirst({
    where: q.whereId(sourceDocumentId),
  });

  if (document == null) {
    throw new NotFoundError("Source document");
  }

  return {
    id: document.id,
    text: document.text,
    imageUrls: document.imageUrls ?? [],
    status: document.status,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function getSourceDocumentFull(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto> {
  return getSourceDocumentFullQuery(ledgerId, sourceDocumentId);
}
