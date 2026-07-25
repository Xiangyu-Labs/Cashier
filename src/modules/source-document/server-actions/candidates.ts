"use server";

import { acceptSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/accept-source-document-candidate";
import { abandonSourceDocumentCandidate } from "@/modules/source-document/application/use-cases/abandon-source-document-candidate";
import type {
  AcceptCandidateReconciliationDto,
  AcceptCandidateResponseDto,
  AbandonCandidateReconciliationDto,
  AbandonCandidateResponseDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { withSourceDocumentLedgerAccess } from "./access";
import { buildEntityReconciliation, readSourceDocumentUpdatedAt } from "./reconciliation";

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
    const result = await acceptSourceDocumentCandidate({ ledgerId, sourceDocumentId, revisionId });

    if (operationId != null) {
      // Read authoritative updatedAt from DB
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(
        ledgerId,
        sourceDocumentId
      );
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        {
          id: sourceDocumentId,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "completed",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as unknown as SourceDocumentListItemDto,
        now,
        true,
        false
      );
      return { ...result, reconciliation: entity };
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
    const result = await abandonSourceDocumentCandidate({ ledgerId, sourceDocumentId, revisionId });

    if (operationId != null) {
      // Read authoritative updatedAt from DB
      const authoritativeUpdatedAt = await readSourceDocumentUpdatedAt(
        ledgerId,
        sourceDocumentId
      );
      const now = authoritativeUpdatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(
        operationId,
        {
          id: sourceDocumentId,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "completed",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as unknown as SourceDocumentListItemDto,
        now,
        true,
        false
      );
      return { ...result, reconciliation: entity };
    }

    return result;
  }
);
