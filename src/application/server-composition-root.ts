import {
  postgresCategoryAdapter,
  postgresCurrencyAdapter,
  postgresIdempotencyAdapter,
  postgresLedgerAdapter,
  postgresOtpTokenAdapter,
  postgresServiceCredentialAdapter,
  postgresLedgerProjectionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  postgresSettingsAdapter,
  postgresUserAccountAdapter,
  postgresRevisionAdapter,
  collectTargetSourceDocuments,
  calculateCompletedSourceDocumentTotal,
  countSourceDocumentsByStatus,
  getTargetSourceDocument,
  getTargetSourceDocumentAccessContext,
  listPendingDuplicateReviews,
  listTargetSourceDocuments,
  updateSourceDocument,
  batchUpdateSourceDocuments,
  acceptCandidateRevision,
  abandonCandidateRevision,
  activateDuplicatePendingRevision,
  discardDuplicatePendingRevision,
  cancelPendingRevision,
} from "@/application/adapters/postgres";
import {
  batchUpdateLedgerEntries,
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
import { getLedgerEntryDetail } from "@/application/adapters/postgres/ledger-reads/get-ledger-entry-detail";
import { calculateLedgerEntryStats } from "@/application/adapters/postgres/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-views-by-source-document-ids";
import { hasActiveLedgerEntries } from "@/application/adapters/postgres/ledger-reads/has-active-entries";
import {
  getEnhancedStats,
  getEnhancedStatsQuery,
} from "@/application/adapters/postgres/ledger-reads/get-enhanced-stats";
import {
  postgresFxRateBook,
  fetchWithRetry as fetchExchangeRatesWithRetry,
} from "@/application/adapters/postgres/exchange-rate";

/** Composition root for the PostgreSQL-backed Docker runtime. */
export const serverComposition = {
  accountSecurity: postgresAccountSecurityAdapter,
  rateLimiter: postgresRateLimiter,
  categories: postgresCategoryAdapter,
  currencies: postgresCurrencyAdapter,
  email: resendEmailAdapter,
  exchangeRates: postgresFxRateBook,
  fetchExchangeRatesWithRetry,
  idempotency: postgresIdempotencyAdapter,
  ledgers: postgresLedgerAdapter,
  ledgerProjections: postgresLedgerProjectionAdapter,
  ledgerMutations: {
    batchUpdateEntries: batchUpdateLedgerEntries,
    createEntry: createLedgerEntryWithConversion,
    deleteEntry: deleteLedgerEntry,
    updateEntry: updateLedgerEntryWithConversion,
  },
  ledgerReads: {
    hasActiveEntries: hasActiveLedgerEntries,
    calculateStats: calculateLedgerEntryStats,
    getEntry: getLedgerEntryDetail,
    listEntries: listLedgerEntryPage,
    listEntriesBySourceDocumentIds: listLedgerEntryViewsBySourceDocumentIds,
  },
  stats: {
    getEnhanced: getEnhancedStats,
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
    calculateCompletedTotal: calculateCompletedSourceDocumentTotal,
    collect: collectTargetSourceDocuments,
    counts: countSourceDocumentsByStatus,
    get: getTargetSourceDocument,
    getAccessContext: getTargetSourceDocumentAccessContext,
    listPendingDuplicateReviews,
    list: listTargetSourceDocuments,
  },
  credentialSourceDocuments: postgresCredentialSourceDocumentReadAdapter,
  ledgerChanges: postgresLedgerChangeReadAdapter,
  executeSingleProcessingIntent,
  userAccounts: postgresUserAccountAdapter,
} as const;
