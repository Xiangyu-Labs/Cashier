export const SOURCE_DOCUMENT_STATUSES = [
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
  "deleted",
  "candidate_pending",
  "duplicate_pending",
] as const;

export const ACTIVE_SOURCE_DOCUMENT_STATUSES = [
  "processing",
  "completed",
  "anomaly",
  "failed",
  "cancelled",
  "candidate_pending",
  "duplicate_pending",
] as const;

export const SourceDocumentStatus = {
  Processing: SOURCE_DOCUMENT_STATUSES[0],
  Completed: SOURCE_DOCUMENT_STATUSES[1],
  Anomaly: SOURCE_DOCUMENT_STATUSES[2],
  Failed: SOURCE_DOCUMENT_STATUSES[3],
  Cancelled: SOURCE_DOCUMENT_STATUSES[4],
  Deleted: SOURCE_DOCUMENT_STATUSES[5],
  CandidatePending: SOURCE_DOCUMENT_STATUSES[6],
  DuplicatePending: SOURCE_DOCUMENT_STATUSES[7],
} as const;

export type SourceDocumentStatusType = (typeof SOURCE_DOCUMENT_STATUSES)[number];
export type ActiveSourceDocumentStatusType = (typeof ACTIVE_SOURCE_DOCUMENT_STATUSES)[number];

export function canonicalizeSourceDocumentStatuses(
  statuses: readonly SourceDocumentStatusType[] | undefined
): SourceDocumentStatusType[] | undefined {
  if (statuses == null || statuses.length === 0) return undefined;
  return [...new Set(statuses)].sort();
}

export const SOURCE_DOCUMENT_TYPES = ["ai_parsed", "manual"] as const;

export const SourceDocumentType = {
  AiParsed: SOURCE_DOCUMENT_TYPES[0],
  Manual: SOURCE_DOCUMENT_TYPES[1],
} as const;

export type SourceDocumentTypeValue = (typeof SOURCE_DOCUMENT_TYPES)[number];

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
