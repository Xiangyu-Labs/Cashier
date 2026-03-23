import { and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  sourceDocumentCollectionInputSchema,
  type ListSourceDocumentCollectionInput,
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

type ParsedSourceDocumentCollectionInput = z.output<typeof sourceDocumentCollectionInputSchema>;

export interface SourceDocumentCollectionParams {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  limit: number;
}

export async function listSourceDocumentCollectionQuery(
  ledgerId: string,
  params: SourceDocumentCollectionParams
): Promise<SourceDocumentCollectionDto> {
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

  const rows = await db.query.sourceDocuments.findMany({
    where: and(...conditions),
    orderBy: [
      desc(sourceDocuments.entryDate),
      desc(sourceDocuments.createdAt),
      desc(sourceDocuments.id),
    ],
    limit: params.limit + 1,
  });

  const hasMore = rows.length > params.limit;
  const resultItems = hasMore ? rows.slice(0, params.limit) : rows;
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

export async function getSourceDocumentCollection(
  ledgerId: string,
  params: ListSourceDocumentCollectionInput
): Promise<SourceDocumentCollectionDto> {
  const parsed = sourceDocumentCollectionInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  return getSourceDocumentCollectionFromValidatedInput(ledgerId, parsed.data);
}

export async function getSourceDocumentCollectionFromValidatedInput(
  ledgerId: string,
  validated: ParsedSourceDocumentCollectionInput
): Promise<SourceDocumentCollectionDto> {
  const queryParams: SourceDocumentCollectionParams = {
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    ...(validated.minAmount !== undefined ? { minAmount: validated.minAmount } : {}),
    ...(validated.maxAmount !== undefined ? { maxAmount: validated.maxAmount } : {}),
    limit: validated.limit,
  };

  const result = await listSourceDocumentCollectionQuery(ledgerId, queryParams);

  if (result.hasMore) {
    logger.warn(
      {
        ledgerId,
        limit: queryParams.limit,
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
      },
      "getSourceDocumentCollection hit bounded collection limit"
    );
  }

  return result;
}
