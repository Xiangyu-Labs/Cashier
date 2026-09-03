import type { BatchUpdateSourceDocumentsInput } from "@/modules/source-document/contract-schemas";
import type { SaveSourceDocumentChangesInput } from "../../contracts";
import type { SourceDocumentUpdatePort } from "../ports";

export function batchUpdateSourceDocuments(
  input: {
    ledgerId: string;
    sourceDocumentIds: string[];
    data: BatchUpdateSourceDocumentsInput;
  },
  updates: Pick<SourceDocumentUpdatePort, "batchUpdate">
) {
  return updates.batchUpdate(input);
}

export function saveSourceDocumentChanges(
  ledgerId: string,
  input: SaveSourceDocumentChangesInput,
  updates: Pick<SourceDocumentUpdatePort, "saveChangesAtomically">
) {
  return updates.saveChangesAtomically({
    ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    expectedRevisionId: input.expectedRevisionId,
    operationId: input.operationId,
    ...(input.sourceDocument === undefined ? {} : { sourceDocument: input.sourceDocument }),
    entries: input.entries,
  });
}
