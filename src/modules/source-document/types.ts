export const SOURCE_DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
  "deleted",
] as const;

export const ACTIVE_SOURCE_DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
] as const;

export const SourceDocumentStatus = {
  Queued: SOURCE_DOCUMENT_STATUSES[0],
  Processing: SOURCE_DOCUMENT_STATUSES[1],
  Completed: SOURCE_DOCUMENT_STATUSES[2],
  Anomaly: SOURCE_DOCUMENT_STATUSES[3],
  Failed: SOURCE_DOCUMENT_STATUSES[4],
  Deleted: SOURCE_DOCUMENT_STATUSES[5],
} as const;

export type SourceDocumentStatusType = (typeof SOURCE_DOCUMENT_STATUSES)[number];
export type ActiveSourceDocumentStatusType = (typeof ACTIVE_SOURCE_DOCUMENT_STATUSES)[number];

export const SOURCE_DOCUMENT_TYPES = ["ai_parsed", "manual"] as const;

export const SourceDocumentType = {
  AiParsed: SOURCE_DOCUMENT_TYPES[0],
  Manual: SOURCE_DOCUMENT_TYPES[1],
} as const;

export type SourceDocumentTypeValue = (typeof SOURCE_DOCUMENT_TYPES)[number];

export interface SourceDocumentMetadata {
  visionDescription?: string;
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
