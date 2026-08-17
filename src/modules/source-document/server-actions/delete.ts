"use server";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
import { parseMutationIdentity } from "@/modules/source-document/contract-schemas";
import { deleteSourceDocument } from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Delete a single source document (soft delete with cascade).
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string,
    operationId?: string
  ): Promise<DeleteSourceDocumentResultDto> => {
    const identity = parseMutationIdentity({
      sourceDocumentId: sourceId,
      ...(operationId === undefined ? {} : { operationId }),
    });

    return deleteSourceDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
      },
      serverComposition.sourceDocumentRevisions
    );
  }
);
