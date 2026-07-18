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
  getTargetSourceDocument,
  getTargetSourceDocumentAccessContext,
  listTargetSourceDocuments,
  updateSourceDocument,
  batchUpdateSourceDocuments,
} from "@/application/adapters/postgres";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/application/adapters/postgres/mutate-ledger-entries";
import { deleteLedgerEntry } from "@/application/adapters/postgres/delete-ledger-entry";
import { resendEmailAdapter } from "@/application/adapters/email/resend";
import {
  executeSingleProcessingIntent,
} from "@/application/adapters/in-process";
import { storedFileAdapter } from "@/application/adapters/storage";
import { listLedgerEntryPage } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-page";
import { getLedgerEntryDetail } from "@/application/adapters/postgres/ledger-reads/get-ledger-entry-detail";
import { calculateLedgerEntryStats } from "@/application/adapters/postgres/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/application/adapters/postgres/ledger-reads/list-ledger-entry-views-by-source-document-ids";
import {
  getEnhancedStats,
  getEnhancedStatsQuery,
} from "@/application/adapters/postgres/ledger-reads/get-enhanced-stats";
import {
  ExchangeRateService,
  fetchWithRetry as fetchExchangeRatesWithRetry,
} from "@/application/adapters/postgres/exchange-rate";

/** Composition root for the PostgreSQL-backed Docker runtime. */
export const currentApplication = {
  categories: postgresCategoryAdapter,
  currencies: postgresCurrencyAdapter,
  email: resendEmailAdapter,
  exchangeRates: ExchangeRateService,
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
  sourceDocumentRevisions: postgresRevisionAdapter,
  sourceDocumentReads: {
    collect: collectTargetSourceDocuments,
    get: getTargetSourceDocument,
    getAccessContext: getTargetSourceDocumentAccessContext,
    list: listTargetSourceDocuments,
  },
  executeSingleProcessingIntent,
  userAccounts: postgresUserAccountAdapter,
} as const;
