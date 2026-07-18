"use server";

import { currentApplication } from "@/application/current";
import { acceptSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/accept-source-document-candidate";
import { abandonSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/abandon-source-document-candidate";
import type {
  AcceptCandidateResponseDto,
  AbandonCandidateResponseDto,
} from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Accept a completed candidate revision for a source document.
 *
 * Replaces the active ledger projection with the candidate revision's entries.
 */
export const acceptSourceDocumentCandidateAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    revisionId: string
  ): Promise<AcceptCandidateResponseDto> => {
    return acceptSourceDocumentCandidate({ ledgerId, sourceDocumentId, revisionId });
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
    revisionId: string
  ): Promise<AbandonCandidateResponseDto> => {
    return abandonSourceDocumentCandidate({ ledgerId, sourceDocumentId, revisionId });
  }
);
