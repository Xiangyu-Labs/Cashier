import { collectTargetSourceDocuments } from "@/application/adapters/sqlite";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  sourceDocumentCollectionInputSchema,
  type ListSourceDocumentCollectionInput,
} from "@/modules/source-document/contract-schemas";
import type { SourceDocumentCollectionDto } from "../../contracts";
import { listEntriesBySourceDocumentIds } from "./list-source-document-page";

export interface SourceDocumentCollectionParams {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  limit: number;
}

export async function querySourceDocumentCollection(
  ledgerId: string,
  params: SourceDocumentCollectionParams
): Promise<SourceDocumentCollectionDto> {
  const result = await collectTargetSourceDocuments({
    ledgerId,
    ...(params.startDate !== undefined ? { startDate: params.startDate } : {}),
    ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
    ...(params.minAmount !== undefined ? { minAmount: params.minAmount } : {}),
    ...(params.maxAmount !== undefined ? { maxAmount: params.maxAmount } : {}),
    limit: params.limit,
  });
  const entriesByDocId = await listEntriesBySourceDocumentIds(
    ledgerId,
    result.items.map((item) => item.id)
  );

  return {
    items: result.items.map((item) => ({
      ...item,
      ledgerEntries: entriesByDocId.get(item.id) ?? [],
    })),
    hasMore: result.hasMore,
    total: result.total,
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

  const queryParams: SourceDocumentCollectionParams = {
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    ...(parsed.data.minAmount !== undefined ? { minAmount: parsed.data.minAmount } : {}),
    ...(parsed.data.maxAmount !== undefined ? { maxAmount: parsed.data.maxAmount } : {}),
    limit: parsed.data.limit,
  };

  const result = await querySourceDocumentCollection(ledgerId, queryParams);

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
