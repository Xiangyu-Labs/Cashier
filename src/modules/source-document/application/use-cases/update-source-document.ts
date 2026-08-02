import type { SourceDocumentUpdatePort } from "../ports";
import type {
  BatchUpdateSourceDocumentsInput,
  UpdateSourceDocumentInput,
} from "@/modules/source-document/contract-schemas";

export function updateSourceDocument(
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    data: UpdateSourceDocumentInput;
  },
  updates: SourceDocumentUpdatePort
) {
  return updates.update(input);
}

export function batchUpdateSourceDocuments(
  input: {
    ledgerId: string;
    sourceDocumentIds: string[];
    data: BatchUpdateSourceDocumentsInput;
  },
  updates: SourceDocumentUpdatePort
) {
  return updates.batchUpdate(input);
}
