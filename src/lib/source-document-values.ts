export const SOURCE_DOCUMENT_PROCESSING_STATUSES = [
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type SourceDocumentProcessingStatus = (typeof SOURCE_DOCUMENT_PROCESSING_STATUSES)[number];

export function canonicalizeSourceDocumentProcessingStatuses(
  statuses: readonly SourceDocumentProcessingStatus[] | undefined
): SourceDocumentProcessingStatus[] | undefined {
  if (statuses == null || statuses.length === 0) return undefined;
  return [...new Set(statuses)].sort();
}

const SOURCE_DOCUMENT_TYPES = ["ai_parsed", "manual"] as const;

export const SourceDocumentType = {
  AiParsed: SOURCE_DOCUMENT_TYPES[0],
  Manual: SOURCE_DOCUMENT_TYPES[1],
} as const;

export type SourceDocumentTypeValue = (typeof SOURCE_DOCUMENT_TYPES)[number];
