"use server";

import {
  batchResolveDuplicateReviews,
  keepDuplicateDocument,
  discardDuplicateDocument,
} from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { serverComposition } from "@/application/server-composition-root";
import type { ResolveDuplicateReviewResult } from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import type { BatchActionResult } from "@/lib/batch-ids";
import {
  parseRevisionMutationIdentity,
  sourceDocumentIdsSchema,
} from "@/modules/source-document/contract-schemas";
import { ValidationError } from "@/lib/errors";

export const getSourceDocumentDuplicateReviewAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceDocumentId: string): Promise<SourceDocumentDuplicateReviewDetailDto> =>
    serverComposition.sourceDocumentReads.duplicateReview(ledgerId, sourceDocumentId)
);

/**
 * Keep a duplicate-pending document: activates its completed pending revision.
 * Idempotent; returns reconciliation data for the optimistic cache.
 */
export const keepDuplicateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<
    ResolveDuplicateReviewResult &
      Partial<{
        reconciliation: Awaited<ReturnType<typeof buildAuthoritativeReconciliation>>;
      }>
  > => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const result = await keepDuplicateDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
    if (identity.operationId == null) return result;
    return {
      ...result,
      reconciliation: await buildAuthoritativeReconciliation(
        identity.operationId,
        ledgerId,
        identity.sourceDocumentId
      ),
    };
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
  ): Promise<
    ResolveDuplicateReviewResult &
      Partial<{
        reconciliation: Awaited<ReturnType<typeof buildAuthoritativeReconciliation>>;
      }>
  > => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const result = await discardDuplicateDocument(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
    if (identity.operationId == null) return result;
    return {
      ...result,
      reconciliation: await buildAuthoritativeReconciliation(
        identity.operationId,
        ledgerId,
        identity.sourceDocumentId
      ),
    };
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
