"use server";

import {
  abandonSourceDocumentCandidate,
  acceptSourceDocumentCandidate,
  cancelSourceDocumentProcessing,
} from "@/modules/source-document/application/use-cases/source-document-lifecycle";
import type {
  AcceptCandidateResponseDto,
  AbandonCandidateResponseDto,
  CancelProcessingResponseDto,
  SourceDocumentCandidateReviewDto,
} from "@/modules/source-document/contracts";
import {
  parseRevisionMutationIdentity,
  sourceDocumentIdSchema,
} from "@/modules/source-document/contract-schemas";
import { ValidationError } from "@/lib/errors";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";

export const getSourceDocumentCandidateReviewAction = withSourceDocumentLedgerAccess(
  async ({ ledgerId }, sourceDocumentId: string): Promise<SourceDocumentCandidateReviewDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }
    return serverComposition.sourceDocumentReads.candidateReview(ledgerId, parsed.data);
  }
);

/**
 * Accept a completed candidate revision for a source document.
 *
 * Replaces the active ledger projection with the candidate revision's entries.
 */
export const acceptSourceDocumentCandidateAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<AcceptCandidateResponseDto> => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    return acceptSourceDocumentCandidate(
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
 * Abandon a completed candidate revision for a source document.
 *
 * Marks the revision as abandoned and clears the pending revision pointer
 * without affecting the active projection.
 */
export const abandonSourceDocumentCandidateAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<AbandonCandidateResponseDto> => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    return abandonSourceDocumentCandidate(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
  }
);

export const cancelSourceDocumentProcessingAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string,
    operationId?: string
  ): Promise<CancelProcessingResponseDto> => {
    const identity = parseRevisionMutationIdentity({
      sourceDocumentId,
      revisionId,
      ...(operationId === undefined ? {} : { operationId }),
    });
    return cancelSourceDocumentProcessing(
      {
        ledgerId,
        sourceDocumentId: identity.sourceDocumentId,
        revisionId: identity.revisionId,
      },
      serverComposition.sourceDocumentLifecycle
    );
  }
);
