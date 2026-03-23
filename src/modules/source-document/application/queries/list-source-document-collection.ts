import { and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  listAllSourceDocumentsInputSchema,
  type ListAllSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import {
  whereSourceDocumentNotDeleted,
} from "@/modules/source-document/application/source-document-state";
import { sourceDocuments } from "@/persistence";
import type { z } from "zod";
import type { SourceDocumentCollectionDto } from "../../contracts";
import { listEntriesBySourceDocumentIds, serializeSourceDocumentListItem } from "./list-source-document-page";
import { buildSourceDocumentAmountConditions } from "./source-document-query-amount";
import { buildSourceDocumentDateConditions } from "./source-document-query-date";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_LIMIT = 1000;

type ParsedListAllSourceDocumentsInput = z.output<typeof listAllSourceDocumentsInputSchema>;

export interface ListAllSourceDocumentsParams {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
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

  const conditions = [
    whereSourceDocumentNotDeleted(ledgerId),
    ...buildSourceDocumentDateConditions(params.startDate, params.endDate),
    ...buildSourceDocumentAmountConditions(ledgerId, params.minAmount, params.maxAmount),
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
