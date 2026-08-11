"use server";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SaveSourceDocumentChangesInput,
  SaveSourceDocumentChangesResultDto,
  UpdateSourceDocumentReconciliationDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  batchUpdateSourceDocumentsInputSchema,
  saveSourceDocumentChangesInputSchema,
  parseMutationIdentity,
  sourceDocumentIdsSchema,
  updateSourceDocumentInputSchema,
  type BatchUpdateSourceDocumentsInput,
  type UpdateSourceDocumentInput,
} from "@/modules/source-document/contract-schemas";
import {
  batchUpdateSourceDocuments,
  updateSourceDocument,
} from "../application/use-cases/update-source-document";
import { saveSourceDocumentChanges } from "../application/use-cases/save-source-document-changes";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { serverComposition } from "@/application/server-composition-root";

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
    const identity = parseMutationIdentity({
      sourceDocumentId: sourceId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const validated = updateSourceDocumentInputSchema.parse(data);
    const result = await updateSourceDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        data: validated,
      },
      serverComposition.sourceDocumentUpdates
    );

    if (identity.operationId != null && result.updated) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          identity.operationId,
          ledgerId,
          identity.sourceDocumentId
        ),
      };
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
    const validatedIds = sourceDocumentIdsSchema.parse(sourceDocumentIds);
    const validated = batchUpdateSourceDocumentsInputSchema.parse(data);
    return batchUpdateSourceDocuments(
      {
        ledgerId,
        sourceDocumentIds: validatedIds,
        data: validated,
      },
      serverComposition.sourceDocumentUpdates
    );
  }
);

export const saveSourceDocumentChangesAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: SaveSourceDocumentChangesInput
  ): Promise<SaveSourceDocumentChangesResultDto> => {
    const validated = saveSourceDocumentChangesInputSchema.parse(input);
    return saveSourceDocumentChanges(
      ledgerId,
      {
        sourceDocumentId: validated.sourceDocumentId,
        expectedRevisionId: validated.expectedRevisionId,
        operationId: validated.operationId,
        ...(validated.sourceDocument === undefined
          ? {}
          : { sourceDocument: validated.sourceDocument }),
        entries: validated.entries,
      },
      serverComposition.sourceDocumentUpdates
    );
  }
);
