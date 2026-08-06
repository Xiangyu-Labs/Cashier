"use server";

import { acceptSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/accept-source-document-candidate";
import { abandonSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/abandon-source-document-candidate";
import { cancelSourceDocumentProcessing } from "@/modules/source-document/application/use-cases/cancel-source-document-processing";
import type {
  AcceptCandidateReconciliationDto,
  AcceptCandidateResponseDto,
  AbandonCandidateReconciliationDto,
  AbandonCandidateResponseDto,
  CancelProcessingReconciliationDto,
  CancelProcessingResponseDto,
  SourceDocumentCandidateReviewDto,
} from "@/modules/source-document/contracts";
import { parseRevisionMutationIdentity } from "@/modules/source-document/contract-schemas";
import { getSourceDocumentCandidateReview } from "@/application/adapters/postgres";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildAuthoritativeReconciliation } from "./reconciliation";
import { serverComposition } from "@/application/server-composition-root";

export const getSourceDocumentCandidateReviewAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceDocumentId: string): Promise<SourceDocumentCandidateReviewDto> =>
    getSourceDocumentCandidateReview(ledgerId, sourceDocumentId)
);

/**
 * Accept a completed candidate revision for a source document.
 *
 * Replaces the active ledger projection with the candidate revision's entries.
 * Returns reconciliation data for the optimistic transaction system.
 */
export const acceptSourceDocumentCandidateAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<
    AcceptCandidateResponseDto &
      Partial<{ reconciliation: AcceptCandidateReconciliationDto["reconciliation"] }>
  > => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const result = await acceptSourceDocumentCandidate(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );

    if (identity.operationId != null) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          identity.operationId,
          ledgerId,
          identity.sourceDocumentId
        ),
      };
    }

    return result;
  }
);

/**
 * Abandon a completed candidate revision for a source document.
 *
 * Marks the revision as abandoned and clears the pending revision pointer
 * without affecting the active projection.
 * Returns reconciliation data for the optimistic transaction system.
 */
export const abandonSourceDocumentCandidateAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<
    AbandonCandidateResponseDto &
      Partial<{ reconciliation: AbandonCandidateReconciliationDto["reconciliation"] }>
  > => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const result = await abandonSourceDocumentCandidate(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );

    if (identity.operationId != null) {
      return {
        ...result,
        reconciliation: await buildAuthoritativeReconciliation(
          identity.operationId,
          ledgerId,
          identity.sourceDocumentId
        ),
      };
    }

    return result;
  }
);

export const cancelSourceDocumentProcessingAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<
    CancelProcessingResponseDto &
      Partial<{ reconciliation: CancelProcessingReconciliationDto["reconciliation"] }>
  > => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    const result = await cancelSourceDocumentProcessing(
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
