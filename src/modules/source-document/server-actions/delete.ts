"use server";
import type {
  DeleteSourceDocumentReconciliationDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { deleteSourceDocument } from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildEntityReconciliation, readSourceDocumentUpdatedAt } from "./reconciliation";
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
    // Read authoritative updatedAt BEFORE soft-delete sets deletedAt
    const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(ledgerId, sourceId);

    const result = await deleteSourceDocument(
      {
        ledgerId,
        sourceDocumentId: sourceId,
      },
      serverComposition.sourceDocumentRevisions
    );

    if (operationId != null && result.deleted) {
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        null, // Tombstone for delete
        now,
        true,
        false
      );
      return { ...result, reconciliation: entity };
    }

    return result;
  }
);
