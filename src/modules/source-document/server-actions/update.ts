"use server";
import type {
  BatchUpdateSourceDocumentsResultDto,
  AtomicBatchCommandResult,
  SaveSourceDocumentChangesInput,
  SaveSourceDocumentChangesResultDto,
  VersionedCommandResult,
} from "@/modules/source-document/contracts";
import {
  batchUpdateSourceDocumentsInputSchema,
  saveSourceDocumentChangesInputSchema,
  type BatchUpdateSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import {
  batchUpdateSourceDocuments,
  saveSourceDocumentChanges,
} from "../application/use-cases/source-document-updates";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Batch update multiple source documents.
 */
export const batchUpdateSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: {
      targets: import("../contracts").VersionedTarget[];
      data: BatchUpdateSourceDocumentsInput;
    }
  ): Promise<AtomicBatchCommandResult<BatchUpdateSourceDocumentsResultDto>> => {
    const validated = batchUpdateSourceDocumentsInputSchema.parse(input);
    return batchUpdateSourceDocuments(
      {
        ledgerId,
        targets: validated.targets,
        data: validated.data,
      },
      serverComposition.sourceDocumentUpdates
    );
  }
);

export const saveSourceDocumentChangesAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: SaveSourceDocumentChangesInput
  ): Promise<VersionedCommandResult<SaveSourceDocumentChangesResultDto>> => {
    const validated = saveSourceDocumentChangesInputSchema.parse(input);
    return saveSourceDocumentChanges(
      ledgerId,
      {
        sourceDocumentId: validated.sourceDocumentId,
        expectedVersion: validated.expectedVersion,
        ...(validated.sourceDocument === undefined
          ? {}
          : { sourceDocument: validated.sourceDocument }),
        entries: validated.entries,
      },
      serverComposition.sourceDocumentUpdates
    );
  }
);
