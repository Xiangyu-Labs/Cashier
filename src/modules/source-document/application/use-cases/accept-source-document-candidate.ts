import type { AcceptCandidateResponseDto } from "@/modules/source-document/contracts";
import type { SourceDocumentLifecyclePort } from "../ports";

interface AcceptCandidateInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

/**
 * Accept a completed candidate revision.
 *
 * Replaces the active ledger projection with the candidate's entries and clears the pending
 * revision pointer. Idempotent when the candidate revision has already been accepted
 * (activeRevisionId on the document already matches the candidate).
 *
 * The adapter acquires a source-document row lock and throws {@link ConflictError} when:
 * - The pending revision does not match
 * - The candidate revision is not completed
 * - The document has no active revision to replace
 * - A concurrent operation mutated the document
 *
 * Throws {@link NotFoundError} when the document does not exist or is deleted.
 */
export async function acceptSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, revisionId }: AcceptCandidateInput,
  lifecycle: SourceDocumentLifecyclePort
): Promise<AcceptCandidateResponseDto> {
  const status = await lifecycle.acceptCandidate(ledgerId, sourceDocumentId, revisionId);

  return {
    sourceDocumentId,
    revisionId,
    status,
  };
}
