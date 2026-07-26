"use server";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SourceDocumentListItemDto,
  UpdateSourceDocumentReconciliationDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  batchUpdateSourceDocumentsInputSchema,
  updateSourceDocumentInputSchema,
  type BatchUpdateSourceDocumentsInput,
  type UpdateSourceDocumentInput,
} from "@/modules/source-document/contract-schemas";
import {
  batchUpdateSourceDocuments,
  updateSourceDocument,
} from "../application/use-cases/update-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildEntityReconciliation, readSourceDocumentUpdatedAt } from "./reconciliation";

/**
 * Update source document metadata (e.g. title, entryDate).
 *
 * Returns the existing DTO with additional reconciliation data for the
 * optimistic transaction system.
 */
export const updateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string,
    data: UpdateSourceDocumentInput,
    operationId?: string
  ): Promise<
    UpdateSourceDocumentResultDto &
      Partial<{ reconciliation: UpdateSourceDocumentReconciliationDto["reconciliation"] }>
  > => {
    const validated = updateSourceDocumentInputSchema.parse(data);
    const result = await updateSourceDocument({
      ledgerId,
      sourceDocumentId: sourceId,
      data: validated,
    });

    if (operationId != null && result.updated) {
      // Read authoritative updatedAt from DB
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(ledgerId, sourceId);
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        {
          id: sourceId,
          ledgerId,
          title: validated.title ?? null,
          text: null,
          files: [],
          status: "completed",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: validated.entryDate ?? null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as SourceDocumentListItemDto,
        now,
        true,
        true
      );
      return { ...result, reconciliation: entity };
    }

    return result;
  }
);

/**
 * Batch update multiple source documents.
 *
 * Returns the existing DTO without reconciliation (transaction model not used
 * for batch operations in this task).
 */
export const batchUpdateSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentIds: string[],
    data: BatchUpdateSourceDocumentsInput
  ): Promise<BatchUpdateSourceDocumentsResultDto> => {
    const validated = batchUpdateSourceDocumentsInputSchema.parse(data);
    return batchUpdateSourceDocuments({
      ledgerId,
      sourceDocumentIds,
      data: validated,
    });
  }
);
