"use server";

import { withLedgerAccess } from "@/lib/auth-actions";
import { safeError } from "@/lib/safe-error";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import {
  getPendingSourceDocumentsQuery,
  getSourceDocumentFullQuery,
  listAllSourceDocumentsQuery,
  listSourceDocumentsQuery,
  sourceDocumentPaginationConfig,
  type ListSourceDocumentsParams,
} from "@/modules/source-document/application/queries/source-document-queries";
import type {
  PendingSourceDocumentsResponse,
  PaginatedSourceDocumentsResponse,
} from "./types";

/**
 * Get paginated source documents with cursor-based pagination
 */
export async function listSourceDocuments(ledgerId: string, params: ListSourceDocumentsParams) {
  return listSourceDocumentsQuery(ledgerId, params);
}

export const getSourceDocumentsAction = withLedgerAccess(listSourceDocuments);

/**
 * Get all source documents as a flat array (not grouped) with proper pagination.
 * Used for the new optimistic update architecture.
 *
 * Note: For backward compatibility, when called without pagination params, it uses
 * a default limit of 1000 documents. For larger datasets, use explicit pagination
 * or cursor-based pagination via getSourceDocumentsAction.
 */
export const getAllSourceDocumentsAction = withLedgerAccess(
  async (
    ledgerId: string,
    params: {
      startDate?: string | null;
      endDate?: string | null;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<PaginatedSourceDocumentsResponse> => {
    try {
      const result = await listAllSourceDocumentsQuery(ledgerId, params);

      if (
        params.page == null &&
        result.items.length === sourceDocumentPaginationConfig.DEFAULT_PAGE_LIMIT
      ) {
        logger.warn(
          {
            ledgerId,
            limit: sourceDocumentPaginationConfig.DEFAULT_PAGE_LIMIT,
            startDate: params.startDate,
            endDate: params.endDate,
          },
          "getAllSourceDocumentsAction hit result limit - consider using cursor pagination"
        );
      }

      return result;
    } catch (error) {
      logger.error({ error, ledgerId }, "Failed to get all source documents");
      throw new AppError(safeError(error), "QUERY_ERROR", 500);
    }
  }
);

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending source documents modal that should always show ALL pending items.
 */
export const getPendingSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string): Promise<PendingSourceDocumentsResponse> => {
    try {
      return await getPendingSourceDocumentsQuery(ledgerId);
    } catch (error) {
      logger.error({ error, ledgerId }, "Failed to get pending source documents");
      throw new AppError(safeError(error), "QUERY_ERROR", 500);
    }
  }
);

/**
 * Get a single source document with full data (including imageUrls).
 * Used for edit-retry when the list view has stripped imageUrls.
 */
export const getSourceDocumentFullAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentId: string) =>
    getSourceDocumentFullQuery(ledgerId, sourceDocumentId)
);
