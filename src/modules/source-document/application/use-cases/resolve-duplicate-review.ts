import type { SourceDocumentLifecyclePort } from "../ports";
import { NotFoundError } from "@/lib/errors";

export interface ResolveDuplicateReviewInput {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId: string;
}

export type ResolveDuplicateReviewResult =
  | { sourceDocumentId: string; revisionId: string; status: "completed"; kept: true }
  | { sourceDocumentId: string; revisionId: string; status: "deleted"; kept: false };

/**
 * Keep a duplicate-pending document: activates its completed pending revision
 * atomically. Idempotent — repeating a completed keep returns success.
 */
export async function keepDuplicateDocument(
  input: ResolveDuplicateReviewInput,
  lifecycle: SourceDocumentLifecyclePort
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
  lifecycle: SourceDocumentLifecyclePort
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
