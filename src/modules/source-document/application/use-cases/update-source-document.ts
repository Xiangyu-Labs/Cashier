import { currentApplication } from "@/application/current";
import type {
  BatchUpdateSourceDocumentsInput,
  UpdateSourceDocumentInput,
} from "@/modules/source-document/contract-schemas";

export function updateSourceDocument(input: {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentInput;
}) {
  return currentApplication.sourceDocumentUpdates.update(input);
}

export function batchUpdateSourceDocuments(input: {
  ledgerId: string;
  sourceDocumentIds: string[];
  data: BatchUpdateSourceDocumentsInput;
}) {
  return currentApplication.sourceDocumentUpdates.batchUpdate(input);
}
