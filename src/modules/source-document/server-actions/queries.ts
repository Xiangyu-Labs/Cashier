"use server";
import { ValidationError } from "@/lib/errors";
import { withLedgerAccess } from "@/modules/ledger/access";
import {
  getAllSourceDocumentsFromValidatedInput,
  getPendingSourceDocuments,
  getSourceDocumentFullQuery,
  listSourceDocumentsFromValidatedInput,
} from "@/modules/source-document/application/queries/source-document-queries";
import type {
  PendingSourceDocumentsResponseDto,
  SourceDocumentCollectionDto,
  SourceDocumentFullDto,
  SourceDocumentPageDto,
} from "@/modules/source-document/contracts";
import {
  listAllSourceDocumentsInputSchema,
  listSourceDocumentsInputSchema,
  sourceDocumentIdSchema,
  type ListAllSourceDocumentsInput,
  type ListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";

/**
 * Get paginated source documents with cursor-based pagination
 */
export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  const parsed = listSourceDocumentsInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  const validated = parsed.data;
  return listSourceDocumentsFromValidatedInput(ledgerId, validated);
}

export const getSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string, params: ListSourceDocumentsInput): Promise<SourceDocumentPageDto> =>
    listSourceDocuments(ledgerId, params)
);

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
    params: ListAllSourceDocumentsInput = {}
  ): Promise<SourceDocumentCollectionDto> => {
    const parsed = listAllSourceDocumentsInputSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    const validated = parsed.data;
    return getAllSourceDocumentsFromValidatedInput(ledgerId, validated);
  }
);

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending source documents modal that should always show ALL pending items.
 */
export const getPendingSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string): Promise<PendingSourceDocumentsResponseDto> =>
    getPendingSourceDocuments(ledgerId)
);

/**
 * Get a single source document with full data (including imageUrls).
 * Used for edit-retry when the list view has stripped imageUrls.
 */
export const getSourceDocumentFullAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentId: string): Promise<SourceDocumentFullDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    return getSourceDocumentFullQuery(ledgerId, parsed.data);
  }
);
