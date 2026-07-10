"use server";
import type {
  BatchUpdateSourceDocumentsResultDto,
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

/**
 * Update source document metadata (e.g. title, entryDate)
 */
export const updateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string,
    data: UpdateSourceDocumentInput
  ): Promise<UpdateSourceDocumentResultDto> => {
    const validated = updateSourceDocumentInputSchema.parse(data);
    return updateSourceDocument({
      ledgerId,
      sourceDocumentId: sourceId,
      data: validated,
    });
  }
);

/**
 * Batch update multiple source documents
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
