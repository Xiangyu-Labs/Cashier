import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";

export interface ApiV1SourceDocumentCreateResponse extends CreateSourceDocumentResponseDto {
  status: "processing";
}

export const apiV1Compatibility = {
  version: "v1",
  status: "stable",
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
