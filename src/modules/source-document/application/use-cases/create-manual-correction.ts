import { ConflictError } from "@/lib/errors";
import { createManualCorrectionInTransaction } from "@/application/adapters/postgres";

interface CreateManualCorrectionInput {
  ledgerId: string;
  sourceDocumentId: string;
}

interface ManualCorrectionResponse {
  sourceDocumentId: string;
  revisionId: string;
  status: "completed";
}

/**
 * Create a manual correction for a source document that has failed or has an anomaly.
 *
 * Creates a completed "manual" revision that inherits evidence (submittedText + stored files)
 * from the current pending revision, and atomically activates it. The document type becomes
 * "manual", allowing the user to edit entries directly.
 *
 * Subject to Task 3 candidate/pending mutual exclusion.
 *
 * Throws ConflictError when:
 * - The document does not exist or is deleted
 * - The document has no pending revision to inherit evidence from
 * - The pending revision is not in anomaly or failed state
 * - The document state changed concurrently
 */
export async function createManualCorrection(
  { ledgerId, sourceDocumentId }: CreateManualCorrectionInput
): Promise<ManualCorrectionResponse> {
  const result = await createManualCorrectionInTransaction(ledgerId, sourceDocumentId);

  if (result == null) {
    throw new ConflictError(
      "Cannot create manual correction: the document was modified concurrently " +
      "or is not in a correctable state"
    );
  }

  return {
    sourceDocumentId,
    revisionId: result.revisionId,
    status: "completed",
  };
}
