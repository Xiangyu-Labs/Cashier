"use server";
import type { BatchRetrySourceDocumentsResultDto } from "@/modules/source-document/contracts";
import { batchRetrySourceDocuments } from "../application/use-cases/batch-retry-source-documents";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Batch retry multiple source documents.
 */
export const batchRetrySourceDocumentsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, ledger },
    sourceDocumentIds: string[]
  ): Promise<BatchRetrySourceDocumentsResultDto> =>
    batchRetrySourceDocuments({
      ledgerId,
      ledger,
      sourceDocumentIds,
    })
);
