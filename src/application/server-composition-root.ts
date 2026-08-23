import "server-only";
import {
  postgresCategoryAdapter,
  postgresCurrencyAdapter,
  postgresLedgerAdapter,
  postgresOtpTokenAdapter,
  postgresServiceCredentialAdapter,
  postgresLedgerProjectionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  postgresSettingsAdapter,
  postgresUserAccountAdapter,
  postgresUserPreferencesAdapter,
  postgresRevisionAdapter,
  collectTargetSourceDocuments,
  calculateCompletedSourceDocumentTotal,
  countSourceDocumentsByStatus,
  summarizePendingSourceDocuments,
  getTargetSourceDocument,
  getTargetSourceDocumentAccessContext,
  getSourceDocumentCandidateReview,
  getSourceDocumentDuplicateReview,
  listPendingDuplicateReviews,
  PostgresProcessingIntentAdapter,
  listTargetSourceDocuments,
  updateSourceDocument,
  batchUpdateSourceDocuments,
  saveSourceDocumentChangesAtomically,
  splitSourceDocumentAtomically,
  acceptCandidateRevision,
  abandonCandidateRevision,
  activateDuplicatePendingRevision,
  discardDuplicatePendingRevision,
  cancelPendingRevision,
} from "@/application/adapters/postgres";
import {
  batchUpdateLedgerEntries,
  batchDeleteLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/application/adapters/postgres/mutate-ledger-entries";
import { deleteLedgerEntry } from "@/application/adapters/postgres/delete-ledger-entry";
import { postgresAccountSecurityAdapter } from "@/application/adapters/postgres/account-security";
import { postgresCredentialSourceDocumentReadAdapter } from "@/application/adapters/postgres/credential-source-document-status";
import { postgresLedgerChangeReadAdapter } from "@/application/adapters/postgres/ledger-changes";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { resendEmailAdapter } from "@/application/adapters/email/resend";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import { storedFileAdapter } from "@/application/adapters/storage";
import { listLedgerEntryPage } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-page";
import { getBatchEntryDateImpact } from "@/application/adapters/postgres/ledger-reads/get-batch-entry-date-impact";
import { getLedgerEntryDetail } from "@/application/adapters/postgres/ledger-reads/get-ledger-entry-detail";
import { calculateLedgerEntryStats } from "@/application/adapters/postgres/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-views-by-source-document-ids";
import { hasActiveLedgerEntries } from "@/application/adapters/postgres/ledger-reads/has-active-entries";
import { getEnhancedStatsQuery } from "@/application/adapters/postgres/ledger-reads/get-enhanced-stats";
import {
  postgresFxRateBook,
  fetchWithRetry as fetchExchangeRatesWithRetry,
} from "@/application/adapters/postgres/exchange-rate";
import { categoryMetadataGeneratorAdapter } from "@/application/adapters/ai/category-metadata-generator";
import {
  runIdempotentLedgerEntryMutation,
  runIdempotentUserMutation,
} from "@/application/adapters/postgres/ledger-entry-idempotency";

/** Composition root for the PostgreSQL-backed Docker runtime. */
export const serverComposition = {
  accountSecurity: postgresAccountSecurityAdapter,
  rateLimiter: postgresRateLimiter,
  categories: postgresCategoryAdapter,
  currencies: postgresCurrencyAdapter,
  email: resendEmailAdapter,
  exchangeRates: postgresFxRateBook,
  fetchExchangeRatesWithRetry,
  ledgers: postgresLedgerAdapter,
  ledgerProjections: postgresLedgerProjectionAdapter,
  ledgerMutations: {
    batchUpdateEntries: batchUpdateLedgerEntries,
    batchDeleteEntries: batchDeleteLedgerEntries,
    createEntry: createLedgerEntryWithConversion,
    deleteEntry: deleteLedgerEntry,
    updateEntry: updateLedgerEntryWithConversion,
  },
  ledgerEntryIdempotency: { run: runIdempotentLedgerEntryMutation },
  userMutationIdempotency: { run: runIdempotentUserMutation },
  ledgerReads: {
    hasActiveEntries: hasActiveLedgerEntries,
    calculateStats: calculateLedgerEntryStats,
    getBatchEntryDateImpact,
    getEntry: getLedgerEntryDetail,
    listEntries: listLedgerEntryPage,
    listEntriesBySourceDocumentIds: listLedgerEntryViewsBySourceDocumentIds,
  },
  categoryMetadataGenerator: categoryMetadataGeneratorAdapter,
  stats: {
    queryEnhanced: getEnhancedStatsQuery,
  },
  otpTokens: postgresOtpTokenAdapter,
  serviceCredentials: postgresServiceCredentialAdapter,
  settings: postgresSettingsAdapter,
  storedFiles: storedFileAdapter,
  sourceDocumentSubmissions: postgresSourceDocumentSubmissionAdapter,
  sourceDocumentUpdates: {
    update: updateSourceDocument,
    batchUpdate: batchUpdateSourceDocuments,
    saveChangesAtomically: saveSourceDocumentChangesAtomically,
    split: splitSourceDocumentAtomically,
  },
  sourceDocumentLifecycle: {
    acceptCandidate: acceptCandidateRevision,
    abandonCandidate: abandonCandidateRevision,
    keepDuplicate: activateDuplicatePendingRevision,
    discardDuplicate: discardDuplicatePendingRevision,
    cancelPending: cancelPendingRevision,
  },
  sourceDocumentRevisions: postgresRevisionAdapter,
  sourceDocumentReads: {
    candidateReview: getSourceDocumentCandidateReview,
    calculateCompletedTotal: calculateCompletedSourceDocumentTotal,
    collect: collectTargetSourceDocuments,
    counts: countSourceDocumentsByStatus,
    pendingSummary: summarizePendingSourceDocuments,
    duplicateReview: getSourceDocumentDuplicateReview,
    get: getTargetSourceDocument,
    getAccessContext: getTargetSourceDocumentAccessContext,
    listPendingDuplicateReviews,
    list: listTargetSourceDocuments,
  },
  credentialSourceDocuments: postgresCredentialSourceDocumentReadAdapter,
  ledgerChanges: postgresLedgerChangeReadAdapter,
  processingRecovery: new PostgresProcessingIntentAdapter(),
  executeSingleProcessingIntent,
  userAccounts: postgresUserAccountAdapter,
  userPreferences: postgresUserPreferencesAdapter,
} as const;
