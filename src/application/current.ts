import {
  sqliteCategoryAdapter,
  sqliteCurrencyAdapter,
  sqliteIdempotencyAdapter,
  sqliteLedgerAdapter,
  sqliteOtpTokenAdapter,
  sqliteServiceCredentialAdapter,
  sqliteLedgerProjectionAdapter,
  sqliteSourceDocumentSubmissionAdapter,
  sqliteSettingsAdapter,
  sqliteUserAccountAdapter,
  sqliteRevisionAdapter,
  collectTargetSourceDocuments,
  getTargetSourceDocument,
  getTargetSourceDocumentAccessContext,
  listTargetSourceDocuments,
  updateSourceDocument,
  batchUpdateSourceDocuments,
} from "@/application/adapters/sqlite";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/application/adapters/sqlite/mutate-ledger-entries";
import { deleteLedgerEntry } from "@/application/adapters/sqlite/delete-ledger-entry";
import { resendEmailAdapter } from "@/application/adapters/email/resend";
import { triggerRevisionProcessingIntent } from "@/application/adapters/in-process";
import { localStoredFileAdapter } from "@/application/adapters/local";
import { listLedgerEntryPage } from "@/application/adapters/sqlite/ledger-reads/list-ledger-entry-page";
import { getLedgerEntryDetail } from "@/application/adapters/sqlite/ledger-reads/get-ledger-entry-detail";
import { calculateLedgerEntryStats } from "@/application/adapters/sqlite/ledger-reads/calculate-ledger-entry-stats";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/application/adapters/sqlite/ledger-reads/list-ledger-entry-views-by-source-document-ids";
import {
  getEnhancedStats,
  getEnhancedStatsQuery,
} from "@/application/adapters/sqlite/ledger-reads/get-enhanced-stats";
import {
  ExchangeRateService,
  fetchWithRetry as fetchExchangeRatesWithRetry,
} from "@/application/adapters/sqlite/exchange-rate";

/** Composition root for the current Docker/SQLite runtime. */
export const currentApplication = {
  categories: sqliteCategoryAdapter,
  currencies: sqliteCurrencyAdapter,
  email: resendEmailAdapter,
  exchangeRates: ExchangeRateService,
  fetchExchangeRatesWithRetry,
  idempotency: sqliteIdempotencyAdapter,
  ledgers: sqliteLedgerAdapter,
  ledgerProjections: sqliteLedgerProjectionAdapter,
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
  otpTokens: sqliteOtpTokenAdapter,
  serviceCredentials: sqliteServiceCredentialAdapter,
  settings: sqliteSettingsAdapter,
  storedFiles: localStoredFileAdapter,
  sourceDocumentSubmissions: sqliteSourceDocumentSubmissionAdapter,
  sourceDocumentUpdates: {
    update: updateSourceDocument,
    batchUpdate: batchUpdateSourceDocuments,
  },
  sourceDocumentRevisions: sqliteRevisionAdapter,
  sourceDocumentReads: {
    collect: collectTargetSourceDocuments,
    get: getTargetSourceDocument,
    getAccessContext: getTargetSourceDocumentAccessContext,
    list: listTargetSourceDocuments,
  },
  triggerRevisionProcessingIntent,
  userAccounts: sqliteUserAccountAdapter,
} as const;
