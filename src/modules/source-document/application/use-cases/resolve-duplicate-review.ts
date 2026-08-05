import type { SourceDocumentLifecyclePort } from "../ports";
import type { SourceDocumentReadPort } from "../ports";
import type { BatchActionResult } from "@/lib/batch-ids";
import { ConflictError, NotFoundError } from "@/lib/errors";

export interface ResolveDuplicateReviewInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

export type DuplicateReviewDecision = "keep" | "discard";
type DuplicateReviewLifecyclePort = Pick<
  SourceDocumentLifecyclePort,
  "keepDuplicate" | "discardDuplicate"
>;

export type ResolveDuplicateReviewResult =
  | { sourceDocumentId: string; revisionId: string; status: "completed"; kept: true }
  | { sourceDocumentId: string; revisionId: string; status: "deleted"; kept: false };

/**
 * Keep a duplicate-pending document: activates its completed pending revision
 * atomically. Idempotent — repeating a completed keep returns success.
 */
export async function keepDuplicateDocument(
  input: ResolveDuplicateReviewInput,
  lifecycle: Pick<SourceDocumentLifecyclePort, "keepDuplicate">
): Promise<ResolveDuplicateReviewResult> {
  const kept = await lifecycle.keepDuplicate(
    input.ledgerId,
    input.sourceDocumentId,
    input.revisionId
  );
  if (!kept) {
    // The document is missing or was already discarded — never acknowledge a
    // keep that did not happen.
    throw new NotFoundError("Source document");
  }
  return {
    sourceDocumentId: input.sourceDocumentId,
    revisionId: input.revisionId,
    status: "completed",
    kept: true,
  };
}

/**
 * Discard a duplicate-pending document: soft-deletes the new document after
 * recording the review decision. Idempotent.
 */
export async function discardDuplicateDocument(
  input: ResolveDuplicateReviewInput,
  lifecycle: Pick<SourceDocumentLifecyclePort, "discardDuplicate">
): Promise<ResolveDuplicateReviewResult> {
  const discarded = await lifecycle.discardDuplicate(
    input.ledgerId,
    input.sourceDocumentId,
    input.revisionId
  );
  if (!discarded) {
    throw new NotFoundError("Source document");
  }
  return {
    sourceDocumentId: input.sourceDocumentId,
    revisionId: input.revisionId,
    status: "deleted",
    kept: false,
  };
}

/**
 * Resolves only the currently pending duplicate reviews from a selected set.
 * The pending review/revision lookup is deliberately batched; each lifecycle
 * operation still re-checks state under its own document lock so races are
 * reported as skipped items instead of being acknowledged as successful.
 */
export async function batchResolveDuplicateReviews(
  input: {
    ledgerId: string;
    sourceDocumentIds: readonly string[];
    decision: DuplicateReviewDecision;
  },
  dependencies: {
    reviews: Pick<SourceDocumentReadPort, "listPendingDuplicateReviews">;
    lifecycle: DuplicateReviewLifecyclePort;
  }
): Promise<BatchActionResult> {
  const ids = [...new Set(input.sourceDocumentIds)];
  const pending = await dependencies.reviews.listPendingDuplicateReviews(input.ledgerId, ids);
  const pendingByDocumentId = new Map(
    pending.map((review) => [review.sourceDocumentId, review] as const)
  );
  const result: BatchActionResult = {
    requestedCount: ids.length,
    succeededIds: [],
    skipped: [],
    failed: [],
  };

  for (const sourceDocumentId of ids) {
    const review = pendingByDocumentId.get(sourceDocumentId);
    if (review == null) {
      result.skipped.push({ id: sourceDocumentId, reason: "not_duplicate_pending" });
      continue;
    }

    try {
      if (input.decision === "keep") {
        await keepDuplicateDocument(
          { ledgerId: input.ledgerId, sourceDocumentId, revisionId: review.revisionId },
          dependencies.lifecycle
        );
      } else {
        await discardDuplicateDocument(
          { ledgerId: input.ledgerId, sourceDocumentId, revisionId: review.revisionId },
          dependencies.lifecycle
        );
      }
      result.succeededIds.push(sourceDocumentId);
    } catch (error) {
      if (error instanceof ConflictError || error instanceof NotFoundError) {
        result.skipped.push({
          id: sourceDocumentId,
          reason: "already_processed",
        });
      } else {
        result.failed.push({
          id: sourceDocumentId,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
  }

  return result;
}
