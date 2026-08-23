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
import type { BatchActionResult } from "@/lib/batch-ids";
import {
  parseRevisionMutationIdentity,
  sourceDocumentIdSchema,
  sourceDocumentIdsSchema,
} from "@/modules/source-document/contract-schemas";
import { ValidationError } from "@/lib/errors";

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
export const keepDuplicateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<ResolveDuplicateReviewResult> => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    return keepDuplicateDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
  }
);

/**
 * Discard a duplicate-pending document: soft-deletes the new document after
 * recording the human decision. Idempotent.
 */
export const discardDuplicateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<ResolveDuplicateReviewResult> => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    return discardDuplicateDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
  }
);

export const batchResolveDuplicateReviewsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    inputIds: string[],
    decision: "keep" | "discard"
  ): Promise<BatchActionResult> => {
    const ids = sourceDocumentIdsSchema.parse(inputIds);
    if (decision !== "keep" && decision !== "discard") {
      throw new ValidationError("Invalid duplicate review decision");
    }
    return batchResolveDuplicateReviews(
      { ledgerId, sourceDocumentIds: ids, decision },
      {
        reviews: serverComposition.sourceDocumentReads,
        lifecycle: serverComposition.sourceDocumentLifecycle,
      }
    );
  }
);
