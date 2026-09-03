import type {
  AbandonCandidateResponseDto,
  AcceptCandidateResponseDto,
  CancelProcessingResponseDto,
} from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";

interface RevisionLifecycleInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

export async function acceptSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, revisionId }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<AcceptCandidateResponseDto> {
  const status = await lifecycle.acceptCandidate(ledgerId, sourceDocumentId, revisionId);
  return { sourceDocumentId, revisionId, status };
}

export async function abandonSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, revisionId }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<AbandonCandidateResponseDto> {
  await lifecycle.abandonCandidate(ledgerId, sourceDocumentId, revisionId);
  return { sourceDocumentId, revisionId, status: "abandoned" };
}

export function cancelSourceDocumentProcessing(
  { ledgerId, sourceDocumentId, revisionId }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<CancelProcessingResponseDto> {
  return lifecycle.cancelPending(ledgerId, sourceDocumentId, revisionId);
}
