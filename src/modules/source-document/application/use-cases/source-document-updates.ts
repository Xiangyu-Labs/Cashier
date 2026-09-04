import type { BatchUpdateSourceDocumentsInput } from "@/modules/source-document/contract-schemas";
import type { SaveSourceDocumentChangesInput } from "../../contracts";
import type { SourceDocumentUpdatePort } from "../ports";

export function batchUpdateSourceDocuments(
  input: {
    ledgerId: string;
    targets: import("../../contracts").VersionedTarget[];
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
    expectedVersion: input.expectedVersion,
    ...(input.sourceDocument === undefined ? {} : { sourceDocument: input.sourceDocument }),
    entries: input.entries,
  });
}
