import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";

/**
 * API v1 remains additive through 2026-10-13, the documented rollback window
 * for this application-layer migration. No task identifier is published by v1.
 */
export const apiV1Compatibility = {
  version: "v1",
  additiveUntil: "2026-10-13",
  deprecatedTaskFields: [] as const,
  replacement: "revision-derived status and sourceDocumentId",
} as const;

export function toApiV1SourceDocumentCreateResponse(
  result: CreateSourceDocumentResponseDto
): CreateSourceDocumentResponseDto {
  return {
    sourceDocumentId: result.sourceDocumentId,
    status: result.status,
  };
}
