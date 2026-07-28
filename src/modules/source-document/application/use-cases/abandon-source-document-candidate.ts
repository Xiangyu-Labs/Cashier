import { abandonCandidateRevision } from "@/application/adapters/postgres";
import type { AbandonCandidateResponseDto } from "@/modules/source-document/contracts";

interface AbandonCandidateInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

/**
 * Abandon a terminal retry candidate revision.
 *
 * Marks the candidate revision as abandoned and clears the pending revision pointer
 * without affecting the active projection. Idempotent when the candidate revision
 * is already abandoned.
 *
 * The adapter acquires a source-document row lock and throws {@link ConflictError} when:
 * - The pending revision does not match
 * - The candidate revision is not completed
 * - A concurrent operation mutated the document or revision
 *
 * Throws {@link NotFoundError} when the document does not exist or is deleted.
 */
export async function abandonSourceDocumentCandidate({
  ledgerId,
  sourceDocumentId,
  revisionId,
}: AbandonCandidateInput): Promise<AbandonCandidateResponseDto> {
  await abandonCandidateRevision(ledgerId, sourceDocumentId, revisionId);

  return {
    sourceDocumentId,
    revisionId,
    status: "abandoned",
  };
}
