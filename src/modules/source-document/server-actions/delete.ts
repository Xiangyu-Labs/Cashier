"use server";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";
import { parseMutationIdentity } from "@/modules/source-document/contract-schemas";
import { deleteSourceDocument } from "../application/use-cases/delete-source-document";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";
import { sourceDocumentFingerprint } from "@/modules/source-document/source-document-fingerprint";

/**
 * Delete a single source document (soft delete with cascade).
 */
export const deleteSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, userId },
    sourceId: string,
    operationId?: string
  ): Promise<DeleteSourceDocumentResultDto> => {
    const identity = parseMutationIdentity({
      sourceDocumentId: sourceId,
      ...(operationId === undefined ? {} : { operationId }),
    });

    const mutation = () =>
      deleteSourceDocument(
        { ledgerId, sourceDocumentId: identity.sourceDocumentId },
        serverComposition.sourceDocumentRevisions
      );
    return identity.operationId == null
      ? mutation()
      : serverComposition.userMutationIdempotency.run(
          {
            userId,
            key: `source-document:delete:${ledgerId}:${identity.sourceDocumentId}:${identity.operationId}`,
            fingerprint: sourceDocumentFingerprint({}),
          },
          mutation
        );
  }
);
