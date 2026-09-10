export {
  SOURCE_DOCUMENT_PROCESSING_STATUSES,
  canonicalizeSourceDocumentProcessingStatuses,
  type SourceDocumentProcessingStatus,
  type SourceDocumentTypeValue,
} from "@/lib/source-document-values";

export interface EntryEditData {
  itemName: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  description: string | null;
}
