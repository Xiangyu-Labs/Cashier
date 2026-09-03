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
import { sourceDocumentIdSchema } from "@/modules/source-document/contract-schemas";
import { ValidationError } from "@/lib/errors";
import { withSourceDocumentLedgerAccess } from "./access";
import { serverComposition } from "@/application/server-composition-root";
import { revisionLifecycleAction } from "./revision-lifecycle-action";

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
export const acceptSourceDocumentCandidateAction =
  revisionLifecycleAction<AcceptCandidateResponseDto>(acceptSourceDocumentCandidate);

/**
 * Abandon a completed candidate revision for a source document.
 *
 * Marks the revision as abandoned and clears the pending revision pointer
 * without affecting the active projection.
 */
export const abandonSourceDocumentCandidateAction =
  revisionLifecycleAction<AbandonCandidateResponseDto>(abandonSourceDocumentCandidate);

export const cancelSourceDocumentProcessingAction =
  revisionLifecycleAction<CancelProcessingResponseDto>(cancelSourceDocumentProcessing);
