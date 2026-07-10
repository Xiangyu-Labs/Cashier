"use server";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
import { deleteSourceDocument } from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Delete a single source document (soft delete with cascade)
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceId: string): Promise<DeleteSourceDocumentResultDto> =>
    deleteSourceDocument({
      ledgerId,
      sourceDocumentId: sourceId,
    })
);
