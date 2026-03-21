export {
  SOURCE_DOCUMENT_STATUSES,
  SOURCE_DOCUMENT_TYPES,
  SourceDocumentStatus,
  SourceDocumentType,
} from "@/types/source-document";
export type {
  SourceDocMetadata,
  SourceDocumentMetadata,
  SourceDocumentStatusType,
  SourceDocumentTypeValue,
} from "@/types/source-document";

export interface EntryEditData {
  itemName: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  description: string | null;
}
