import "server-only";
import {
  postgresCategoryAdapter,
  postgresCurrencyAdapter,
  postgresLedgerAdapter,
  postgresOtpTokenAdapter,
  postgresServiceCredentialAdapter,
  postgresSettingsAdapter,
  postgresUserAccountAdapter,
  postgresUserPreferencesAdapter,
  calculateCompletedSourceDocumentTotal,
  getTargetSourceDocument,
  getTargetSourceDocumentAccessContext,
  getSourceDocumentCandidateReview,
  getSourceDocumentDuplicateReview,
  listPendingDuplicateReviews,
  PostgresProcessingIntentAdapter,
  listTargetSourceDocuments,
  postgresSourceDocumentAggregateAdapter,
} from "@/application/adapters/postgres";
import { listDuplicateDetectionCandidates } from "@/application/adapters/postgres/duplicate-candidates";
import { loadRevisionProcessingContext } from "@/application/adapters/postgres/revision-processing-context";
import {
  postgresLedgerProjectionAdapter,
  storeCandidateRevision,
  storeDuplicatePendingRevision,
} from "@/application/adapters/postgres/ledger-projections";
import { postgresRevisionAdapter } from "@/application/adapters/postgres/revisions";
import { postgresAccountSecurityAdapter } from "@/application/adapters/postgres/account-security";
import { postgresCredentialSourceDocumentReadAdapter } from "@/application/adapters/postgres/credential-source-document-status";
import { postgresLedgerChangeReadAdapter } from "@/application/adapters/postgres/ledger-changes";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { resendEmailAdapter } from "@/application/adapters/email/resend";
import {
  createExecuteSingleProcessingIntent,
  CurrentRevisionProcessor,
  loadStoredFilesForAI,
} from "@/application/adapters/in-process";
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
import { createAIContext } from "@/lib/tasks/ai-context";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { runtimeEnv } from "@/lib/env/runtime";
import type { AIContext } from "@/lib/tasks/types";

function createRevisionProcessor(
  createContext: (signal: AbortSignal) => AIContext = (signal) =>
    createAIContext({
      signal,
      getClient: getOpenAIClient,
      modelConfig: { text: runtimeEnv.aiModel, vision: runtimeEnv.aiModel },
    })
) {
  return new CurrentRevisionProcessor({
    createAIContext: createContext,
    loadContext: loadRevisionProcessingContext,
    getSettings: (ledgerId) => postgresSettingsAdapter.get(ledgerId),
    loadStoredFiles: (ledgerId, storedFileIds) =>
      loadStoredFilesForAI(
        (authorizedLedgerId, storedFileId) =>
          storedFileAdapter.readAuthorized(authorizedLedgerId, storedFileId),
        ledgerId,
        storedFileIds
      ),
    listDuplicateCandidates: listDuplicateDetectionCandidates,
    getRates: (date) => postgresFxRateBook.getRates(date),
    preserveTerminalOutcome: (input) => postgresRevisionAdapter.preserveTerminalOutcome(input),
    getRevision: (ledgerId, sourceDocumentId) =>
      postgresRevisionAdapter.get(ledgerId, sourceDocumentId),
    activateRevision: (input) => postgresLedgerProjectionAdapter.activateRevision(input),
    storeCandidateRevision,
    storeDuplicatePendingRevision,
  });
}

const executeSingleProcessingIntent = createExecuteSingleProcessingIntent({
  createIntentAdapter: () => new PostgresProcessingIntentAdapter(),
  createRevisionProcessor: () => createRevisionProcessor(),
  preserveTerminalOutcome: (input) => postgresRevisionAdapter.preserveTerminalOutcome(input),
});

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
  sourceDocumentAggregate: postgresSourceDocumentAggregateAdapter,
  sourceDocumentReads: {
    candidateReview: getSourceDocumentCandidateReview,
    calculateCompletedTotal: calculateCompletedSourceDocumentTotal,
    duplicateReview: getSourceDocumentDuplicateReview,
    get: getTargetSourceDocument,
    getAccessContext: getTargetSourceDocumentAccessContext,
    listPendingDuplicateReviews,
    list: listTargetSourceDocuments,
  },
  credentialSourceDocuments: postgresCredentialSourceDocumentReadAdapter,
  ledgerChanges: postgresLedgerChangeReadAdapter,
  processingRecovery: new PostgresProcessingIntentAdapter(),
  createRevisionProcessor,
  executeSingleProcessingIntent,
  userAccounts: postgresUserAccountAdapter,
  userPreferences: postgresUserPreferencesAdapter,
} as const;
