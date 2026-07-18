import { ConflictError } from "@/lib/errors";
import { abandonCandidateRevision } from "@/application/adapters/postgres";
import type { AbandonCandidateResponseDto } from "@/modules/source-document/contracts";

interface AbandonCandidateInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

/**
 * Abandon a completed candidate revision.
 *
 * Marks the candidate revision as abandoned and clears the pending revision pointer
 * without affecting the active projection. Idempotent when the candidate revision
 * is already abandoned.
 *
 * Throws ConflictError when:
 * - The document does not exist or is deleted
 * - The pending revision does not match
 * - The candidate revision is not completed
 */
export async function abandonSourceDocumentCandidate(
  { ledgerId, sourceDocumentId, revisionId }: AbandonCandidateInput
): Promise<AbandonCandidateResponseDto> {
  const abandoned = await abandonCandidateRevision(ledgerId, sourceDocumentId, revisionId);

  if (!abandoned) {
    throw new ConflictError(
      "Cannot abandon candidate: either the document was modified concurrently, " +
      "the candidate revision does not match, or the candidate is not in the expected state"
    );
  }

  return {
    sourceDocumentId,
    revisionId,
    status: "abandoned",
  };
}
