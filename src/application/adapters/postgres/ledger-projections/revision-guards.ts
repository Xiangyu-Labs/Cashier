import { and, eq } from "drizzle-orm";
import { StaleSourceDocumentVersionError } from "@/lib/errors";
import { duplicateReviews, sourceDocumentRevisions } from "@/persistence";
import type { PostgresTransaction } from "../transaction-locks";

export function assertExpectedSourceDocumentVersion(
  sourceDocumentId: string,
  expectedVersion: number,
  actualVersion: number
) {
  if (actualVersion !== expectedVersion) {
    throw new StaleSourceDocumentVersionError(sourceDocumentId, expectedVersion, actualVersion);
  }
}

export function ledgerScopedRevisionWhere(
  ledgerId: string,
  sourceDocumentId: string,
  revisionId: string
) {
  return and(
    eq(sourceDocumentRevisions.ledgerId, ledgerId),
    eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId),
    eq(sourceDocumentRevisions.id, revisionId)
  );
}

export async function hasActiveDuplicateReviewPending(
  tx: PostgresTransaction,
  ledgerId: string,
  sourceDocumentId: string,
  activeRevisionId: string
): Promise<boolean> {
  const pendingReview = await tx
    .select({ id: duplicateReviews.id })
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
        eq(duplicateReviews.revisionId, activeRevisionId),
        eq(duplicateReviews.status, "pending")
      )
    )
    .then((rows) => rows[0]);
  return pendingReview != null;
}
