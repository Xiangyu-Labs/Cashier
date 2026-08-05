"use server";

import {
  keepDuplicateDocument,
  discardDuplicateDocument,
} from "@/modules/source-document/application/use-cases/resolve-duplicate-review";
import { getSourceDocumentDuplicateReview } from "@/application/adapters/postgres";
import type { SourceDocumentDuplicateReviewDetailDto } from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { serverComposition } from "@/application/server-composition-root";
import type { ResolveDuplicateReviewResult } from "@/modules/source-document/application/use-cases/resolve-duplicate-review";

export const getSourceDocumentDuplicateReviewAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceDocumentId: string): Promise<SourceDocumentDuplicateReviewDetailDto> =>
    getSourceDocumentDuplicateReview(ledgerId, sourceDocumentId)
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
    const result = await keepDuplicateDocument(
      { ledgerId, sourceDocumentId, revisionId },
      serverComposition.sourceDocumentLifecycle
    );
    if (operationId == null) return result;
    return {
      ...result,
      reconciliation: await buildAuthoritativeReconciliation(
        operationId,
        ledgerId,
        sourceDocumentId
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
    const result = await discardDuplicateDocument(
      { ledgerId, sourceDocumentId, revisionId },
      serverComposition.sourceDocumentLifecycle
    );
    if (operationId == null) return result;
    return {
      ...result,
      reconciliation: await buildAuthoritativeReconciliation(
        operationId,
        ledgerId,
        sourceDocumentId
      ),
    };
  }
);
