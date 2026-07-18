import { ConflictError } from "@/lib/errors";
import { acceptCandidateRevision } from "@/application/adapters/postgres";
import type { AcceptCandidateResponseDto } from "@/modules/source-document/contracts";

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
 * Throws ConflictError when:
 * - The document does not exist or is deleted
 * - The pending revision does not match
 * - The candidate revision is not completed
 * - The document has no active revision to replace
 */
export async function acceptSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, revisionId }: AcceptCandidateInput
): Promise<AcceptCandidateResponseDto> {
  const accepted = await acceptCandidateRevision(ledgerId, sourceDocumentId, revisionId);

  if (!accepted) {
    throw new ConflictError(
      "Cannot accept candidate: either the document was modified concurrently, " +
      "the candidate revision does not match, or the candidate is not in the expected state"
    );
  }

  return {
    sourceDocumentId,
    revisionId,
    status: "completed",
  };
}
