export {
  ACTIVE_SOURCE_DOCUMENT_STATUSES,
  canonicalizeSourceDocumentStatuses,
  type SourceDocumentStatusType,
  type SourceDocumentTypeValue,
} from "@/lib/source-document-values";

export interface EntryEditData {
  itemName: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  description: string | null;
}
