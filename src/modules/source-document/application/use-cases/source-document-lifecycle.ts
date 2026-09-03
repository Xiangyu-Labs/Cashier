import type {
  AbandonCandidateResponseDto,
  AcceptCandidateResponseDto,
  CancelProcessingResponseDto,
} from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";
import { NotFoundError } from "@/lib/errors";

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
  const abandoned = await lifecycle.abandonCandidate(ledgerId, sourceDocumentId, revisionId);
  if (!abandoned) throw new NotFoundError("Source document");
  return { sourceDocumentId, revisionId, status: "abandoned" };
}

export function cancelSourceDocumentProcessing(
  { ledgerId, sourceDocumentId, revisionId }: RevisionLifecycleInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<CancelProcessingResponseDto> {
  return lifecycle.cancelPending(ledgerId, sourceDocumentId, revisionId);
}
