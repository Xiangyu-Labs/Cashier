"use server";

import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  batchDeleteSourceDocuments,
  deleteSourceDocument,
} from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Delete a single source document (soft delete with cascade)
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string
  ): Promise<DeleteSourceDocumentResultDto> =>
    deleteSourceDocument({
      ledgerId,
      sourceDocumentId: sourceId,
    })
);

/**
 * Batch delete multiple source documents (soft delete with cascade)
 */
export const batchDeleteSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentIds: string[]
  ): Promise<BatchDeleteSourceDocumentsResultDto> =>
    batchDeleteSourceDocuments({
      ledgerId,
      sourceDocumentIds,
    })
);
