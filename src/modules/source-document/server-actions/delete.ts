"use server";
import type {
  DeleteSourceDocumentReconciliationDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { parseMutationIdentity } from "@/modules/source-document/contract-schemas";
import { deleteSourceDocument } from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildDeleteReconciliation } from "./reconciliation";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Delete a single source document (soft delete with cascade).
 *
 * Returns the existing DTO with additional reconciliation data for the
 * optimistic transaction system.
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string,
    operationId?: string
  ): Promise<
    DeleteSourceDocumentResultDto &
      Partial<{ reconciliation: DeleteSourceDocumentReconciliationDto["reconciliation"] }>
  > => {
    const identity = parseMutationIdentity({
      sourceDocumentId: sourceId,
      ...(operationId === undefined ? {} : { operationId }),
    });

    const result = await deleteSourceDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
      },
      serverComposition.sourceDocumentRevisions
    );

    if (identity.operationId != null && result.deleted) {
      return {
        ...result,
        reconciliation: await buildDeleteReconciliation(
          identity.operationId,
          ledgerId,
          identity.sourceDocumentId
        ),
      };
    }

    return result;
  }
);
