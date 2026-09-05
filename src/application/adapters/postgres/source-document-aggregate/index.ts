import type { SourceDocumentAggregateWritePort } from "@/modules/source-document/application/ports";
import { postgresLedgerEntryCommandAdapter } from "../ledger-entry-commands";
import { postgresLedgerProjectionAdapter } from "../ledger-projections";
import {
  abandonCandidateRevision,
  acceptCandidateRevision,
  activateDuplicatePendingRevision,
  cancelPendingRevision,
  discardDuplicatePendingRevision,
} from "../ledger-projections/activate-revision";
import { postgresSourceDocumentSubmissionAdapter } from "../submissions";
import { saveChanges, updateDocuments, updateEntryDates } from "../source-document-updates";
import { splitSourceDocumentAtomically } from "../source-document-splits";
import { deleteSourceDocumentAtomically } from "../source-document-delete";

export const postgresSourceDocumentAggregateAdapter: SourceDocumentAggregateWritePort = {
  createProcessingDocument: (input) =>
    postgresSourceDocumentSubmissionAdapter.createPendingWithIntent(input),
  createIdempotentProcessingDocument: (idempotency, prepare) =>
    postgresSourceDocumentSubmissionAdapter.createIdempotentPendingWithIntent(idempotency, prepare),
  createManualDocument: (input) => postgresLedgerProjectionAdapter.createManual(input),
  saveChanges,
  updateDocuments,
  updateEntryDates,
  addEntry: (input) => postgresLedgerEntryCommandAdapter.create(input),
  updateEntries: (input) => postgresLedgerEntryCommandAdapter.update(input),
  deleteEntries: (input) => postgresLedgerEntryCommandAdapter.delete(input),
  batchUpdateEntries: (input) => postgresLedgerEntryCommandAdapter.batchUpdate(input),
  batchDeleteEntries: (input) => postgresLedgerEntryCommandAdapter.batchDelete(input),
  splitEntries: splitSourceDocumentAtomically,
  installRetry: (input) => postgresSourceDocumentSubmissionAdapter.createPendingWithIntent(input),
  acceptCandidate: acceptCandidateRevision,
  abandonCandidate: abandonCandidateRevision,
  cancelProcessing: cancelPendingRevision,
  resolveDuplicate: ({ ledgerId, sourceDocumentId, expectedVersion, decision }) =>
    decision === "keep"
      ? activateDuplicatePendingRevision(ledgerId, sourceDocumentId, expectedVersion)
      : discardDuplicatePendingRevision(ledgerId, sourceDocumentId, expectedVersion),
  deleteDocuments: deleteSourceDocumentAtomically,
  completeProcessing: (input) => postgresLedgerProjectionAdapter.activateRevision(input),
  applyMainCurrencyChange: (input) => postgresLedgerProjectionAdapter.recalculate(input),
  recalculateConversions: (input) => postgresLedgerProjectionAdapter.recalculate(input),
};
