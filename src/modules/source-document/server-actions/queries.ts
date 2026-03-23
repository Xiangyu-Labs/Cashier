"use server";
import { ValidationError } from "@/lib/errors";
import { withLedgerAccess } from "@/modules/ledger/access";
import {
  getPendingSourceDocuments,
  getSourceDocumentCollectionFromValidatedInput,
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
  listSourceDocumentsInputSchema,
  sourceDocumentCollectionInputSchema,
  sourceDocumentIdSchema,
  type ListSourceDocumentCollectionInput,
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
 * Get the bounded source document collection used by the workspace stream.
 */
export const getSourceDocumentCollectionAction = withLedgerAccess(
  async (
    ledgerId: string,
    params: ListSourceDocumentCollectionInput
  ): Promise<SourceDocumentCollectionDto> => {
    const parsed = sourceDocumentCollectionInputSchema.safeParse(params);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    const validated = parsed.data;
    return getSourceDocumentCollectionFromValidatedInput(ledgerId, validated);
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
