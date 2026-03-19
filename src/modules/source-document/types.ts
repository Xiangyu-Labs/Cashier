export const SOURCE_DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
] as const;

export type SourceDocumentStatusType = (typeof SOURCE_DOCUMENT_STATUSES)[number];

export const SOURCE_DOCUMENT_TYPES = ["ai_parsed", "manual"] as const;

export type SourceDocumentTypeValue = (typeof SOURCE_DOCUMENT_TYPES)[number];

export interface SourceDocumentMetadata {
  visionDescription?: string;
  originalImageUrls?: Array<string | null>;
}

export type SourceDocMetadata = SourceDocumentMetadata;
