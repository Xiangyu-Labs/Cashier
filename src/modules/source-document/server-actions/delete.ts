"use server";
import { versionedTargetSchema } from "@/modules/source-document/contract-schemas";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Delete a single source document (soft delete with cascade).
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceId: string, expectedVersion: number) => {
    const target = versionedTargetSchema.parse({
      sourceDocumentId: sourceId,
      expectedVersion,
    });
    return serverComposition.sourceDocumentAggregate.deleteDocuments({ ledgerId, target });
  }
);
