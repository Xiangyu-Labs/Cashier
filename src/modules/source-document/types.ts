export {
  ACTIVE_SOURCE_DOCUMENT_STATUSES,
  canonicalizeSourceDocumentStatuses,
  SourceDocumentStatus,
  SourceDocumentType,
  type SourceDocumentStatusType,
  type SourceDocumentTypeValue,
} from "@/lib/source-document-values";

export interface SourceDocumentMetadata {
  visionDescription?: string;
  visionUnderstanding?: Record<string, unknown>;
  originalImageUrls?: Array<string | null>;
  [key: string]: unknown;
}

export type SourceDocMetadata = SourceDocumentMetadata;

export interface EntryEditData {
  itemName: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  description: string | null;
}
