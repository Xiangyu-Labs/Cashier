"use server";

import {
  batchResolveDuplicateReviews,
  keepDuplicateDocument,
  discardDuplicateDocument,
} from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";
import type { ResolveDuplicateReviewResult } from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import {
  sourceDocumentIdSchema,
  versionedTargetsSchema,
} from "@/modules/source-document/contract-schemas";
import type {
  PartialBatchCommandResult,
  VersionedTarget,
} from "@/modules/source-document/contracts";
import { ValidationError } from "@/lib/errors";
import { revisionLifecycleAction, sourceDocumentLifecyclePort } from "./revision-lifecycle-action";

export const getSourceDocumentDuplicateReviewAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string
  ): Promise<SourceDocumentDuplicateReviewDetailDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }
    return serverComposition.sourceDocumentReads.duplicateReview(ledgerId, parsed.data);
  }
);

/**
 * Keep a duplicate-pending document: activates its completed pending revision.
 * Idempotent.
 */
export const keepDuplicateSourceDocumentAction =
  revisionLifecycleAction<ResolveDuplicateReviewResult>(keepDuplicateDocument);

/**
 * Discard a duplicate-pending document: soft-deletes the new document after
 * recording the human decision. Idempotent.
 */
export const discardDuplicateSourceDocumentAction =
  revisionLifecycleAction<ResolveDuplicateReviewResult>(discardDuplicateDocument);

export const batchResolveDuplicateReviewsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    inputTargets: VersionedTarget[],
    decision: "keep" | "discard"
  ): Promise<PartialBatchCommandResult> => {
    const targets = versionedTargetsSchema.parse(inputTargets);
    if (decision !== "keep" && decision !== "discard") {
      throw new ValidationError("Invalid duplicate review decision");
    }
    return batchResolveDuplicateReviews(
      { ledgerId, targets, decision },
      sourceDocumentLifecyclePort()
    );
  }
);
