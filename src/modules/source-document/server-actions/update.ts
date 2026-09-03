"use server";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SaveSourceDocumentChangesInput,
  SaveSourceDocumentChangesResultDto,
} from "@/modules/source-document/contracts";
import {
  batchUpdateSourceDocumentsInputSchema,
  saveSourceDocumentChangesInputSchema,
  sourceDocumentIdsSchema,
  type BatchUpdateSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import {
  batchUpdateSourceDocuments,
  saveSourceDocumentChanges,
} from "../application/use-cases/source-document-updates";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";
import { sourceDocumentFingerprint } from "@/modules/source-document/source-document-fingerprint";

/**
 * Batch update multiple source documents.
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
    { ledgerId, userId },
    input: SaveSourceDocumentChangesInput
  ): Promise<SaveSourceDocumentChangesResultDto> => {
    const validated = saveSourceDocumentChangesInputSchema.parse(input);
    const mutation = () =>
      saveSourceDocumentChanges(
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
    return serverComposition.userMutationIdempotency.run(
      {
        userId,
        key: `source-document:save:${ledgerId}:${validated.sourceDocumentId}:${validated.operationId}`,
        fingerprint: sourceDocumentFingerprint(validated),
      },
      mutation
    );
  }
);
