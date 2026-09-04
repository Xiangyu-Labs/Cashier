import type { SourceDocumentLifecyclePort } from "../ports";
import type { PartialBatchCommandResult, VersionedTarget } from "../../contracts";
import { AppError, NotFoundError, StaleSourceDocumentVersionError } from "@/lib/errors";

export interface ResolveDuplicateReviewInput {
  ledgerId: string;
  sourceDocumentId: string;
  /** Internal compatibility only; browser transports never provide revision identity. */
  revisionId?: string;
  expectedVersion?: number;
}

export type DuplicateReviewDecision = "keep" | "discard";
type DuplicateReviewLifecyclePort = Pick<
  SourceDocumentLifecyclePort,
  "keepDuplicate" | "discardDuplicate"
>;

export type ResolveDuplicateReviewResult =
  { status: "completed"; kept: true } | { status: "deleted"; kept: false };

/**
 * Keep a duplicate-pending document: activates its completed pending revision
 * atomically. Idempotent — repeating a completed keep returns success.
 */
export async function keepDuplicateDocument(
  input: ResolveDuplicateReviewInput,
  lifecycle: Pick<SourceDocumentLifecyclePort, "keepDuplicate">
): Promise<{ version: number; data: ResolveDuplicateReviewResult }> {
  const kept = await lifecycle.keepDuplicate(
    input.ledgerId,
    input.sourceDocumentId,
    input.expectedVersion
  );
  if (!kept) {
    // The document is missing or was already discarded — never acknowledge a
    // keep that did not happen.
    throw new NotFoundError("Source document");
  }
  return { version: kept.version, data: { status: "completed", kept: true } };
}

/**
 * Discard a duplicate-pending document: soft-deletes the new document after
 * recording the review decision. Idempotent.
 */
export async function discardDuplicateDocument(
  input: ResolveDuplicateReviewInput,
  lifecycle: Pick<SourceDocumentLifecyclePort, "discardDuplicate">
): Promise<{ version: number; data: ResolveDuplicateReviewResult }> {
  const discarded = await lifecycle.discardDuplicate(
    input.ledgerId,
    input.sourceDocumentId,
    input.expectedVersion
  );
  if (!discarded) {
    throw new NotFoundError("Source document");
  }
  return { version: discarded.version, data: { status: "deleted", kept: false } };
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
    targets: readonly VersionedTarget[];
    decision: DuplicateReviewDecision;
  },
  lifecycle: DuplicateReviewLifecyclePort
): Promise<PartialBatchCommandResult> {
  const result: PartialBatchCommandResult = {
    succeeded: [],
    stale: [],
    failed: [],
  };

  for (const target of input.targets) {
    const { sourceDocumentId, expectedVersion } = target;
    try {
      const resolved =
        input.decision === "keep"
          ? await keepDuplicateDocument(
              { ledgerId: input.ledgerId, sourceDocumentId, expectedVersion },
              lifecycle
            )
          : await discardDuplicateDocument(
              { ledgerId: input.ledgerId, sourceDocumentId, expectedVersion },
              lifecycle
            );
      result.succeeded.push({ id: sourceDocumentId, sourceDocumentId, version: resolved.version });
    } catch (error) {
      if (error instanceof StaleSourceDocumentVersionError) {
        result.stale.push({
          id: sourceDocumentId,
          sourceDocumentId,
          expectedVersion: error.expectedVersion,
          currentVersion: error.currentVersion,
        });
      } else {
        result.failed.push({
          id: sourceDocumentId,
          code: error instanceof AppError ? error.code : "INTERNAL",
        });
      }
    }
  }

  return result;
}
