import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";

export interface ApiV1SourceDocumentCreateResponse extends CreateSourceDocumentResponseDto {
  /** @deprecated Use revisionState. The field remains, but queued is no longer emitted. */
  status: "processing";
}

/**
 * API v1 retains the deprecated field through 2026-10-13. Its value follows the
 * unified public processing state; no internal queue state is published.
 */
export const apiV1Compatibility = {
  version: "v1",
  additiveUntil: "2026-10-13",
  deprecatedTaskFields: ["status"] as const,
  replacement: "revision-derived status and sourceDocumentId",
} as const;

export function toApiV1SourceDocumentCreateResponse(
  result: CreateSourceDocumentResponseDto
): ApiV1SourceDocumentCreateResponse {
  return {
    sourceDocumentId: result.sourceDocumentId,
    revisionId: result.revisionId,
    revisionState: result.revisionState,
    status: result.revisionState,
  };
}
