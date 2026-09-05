import type {
  LedgerId,
  ProcessingLeaseContract,
  RevisionId,
  SourceDocumentId,
} from "./source-documents";

export interface LedgerPort {
  isOwnedByUser(ledgerId: LedgerId, userId: string): Promise<boolean>;
  getOwned(ledgerId: LedgerId, userId: string): Promise<LedgerContract | null>;
  listIdsForUser(userId: string): Promise<readonly LedgerId[]>;
  listForUser(userId: string): Promise<readonly LedgerContract[]>;
  createDefault(input: {
    userId: string;
    settings: LedgerSettingsContract;
    categories: readonly CategoryMutationContract[];
  }): Promise<LedgerContract>;
  deleteOwned(
    ledgerId: LedgerId,
    userId: string
  ): Promise<"deleted" | "already_deleted" | "forbidden" | "not_found">;
}
export interface CategoryPort {
  list(ledgerId: LedgerId): Promise<readonly CategoryContract[]>;
  get(ledgerId: LedgerId, categoryId: string): Promise<CategoryContract | null>;
  listWithCount(ledgerId: LedgerId): Promise<readonly CategoryWithCountContract[]>;
  create(ledgerId: LedgerId, input: CategoryMutationContract): Promise<CategoryContract>;
  update(
    ledgerId: LedgerId,
    categoryId: string,
    input: Partial<CategoryMutationContract>
  ): Promise<CategoryContract | null>;
  updateMissingMetadata(
    ledgerId: LedgerId,
    categoryId: string,
    input: { icon: string; description: string; expectedName: string }
  ): Promise<{
    status: "updated" | "stale" | "not_found";
    wroteIcon: boolean;
    wroteDescription: boolean;
  }>;
  delete(ledgerId: LedgerId, categoryId: string): Promise<boolean>;
  reorder(ledgerId: LedgerId, categoryIds: readonly string[]): Promise<number>;
  saveAll(
    ledgerId: LedgerId,
    categories: readonly CategoryTargetContract[],
    expectedRevision: string
  ): Promise<readonly CategoryContract[]>;
  countUncategorized(ledgerId: LedgerId): Promise<number>;
}
export interface CurrencyPort {
  convert(amount: string, from: string, to: string, date?: string): Promise<string>;
  recalculateLedger(ledgerId: LedgerId, mainCurrency: string): Promise<number>;
  recalculateLedgerForDate(ledgerId: LedgerId, date: string): Promise<number>;
}
export interface SettingsPort {
  get(ledgerId: LedgerId): Promise<LedgerSettingsContract | null>;
  updateWithCurrencyRecalculation(input: {
    ledgerId: LedgerId;
    userId: string;
    expectedUpdatedAt: string;
    settings: Partial<LedgerSettingsContract>;
  }): Promise<LedgerContract | null>;
  /**
   * Read-only lookup of the ledger's current main currency and the distinct
   * entry dates its live entries need an exchange rate for. Used to
   * pre-fetch missing historical rates (via FxRateBook, outside any
   * transaction) before attempting a main-currency change, so the change
   * isn't rejected just because those days never had a cross-currency
   * conversion before.
   */
  getRequiredExchangeRateDates(
    ledgerId: LedgerId,
    userId: string
  ): Promise<{ currentMainCurrency: string; dates: string[] } | null>;
}

interface CategoryMutationContract {
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

interface CategoryTargetContract {
  id?: string;
  clientId?: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
}

interface CategoryContract {
  id: string;
  ledgerId: LedgerId;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CategoryWithCountContract extends CategoryContract {
  entryCount: number;
}

export interface LedgerSettingsContract {
  aiLanguage?: string;
  currencies?: string[];
  mainCurrency?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
  duplicateDetectionEnabled?: boolean;
  timeZone?: string | null;
}

export interface LedgerContract {
  id: LedgerId;
  userId: string;
  settings: LedgerSettingsContract;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedServiceCredentialContract {
  id: string;
  ledgerId: LedgerId;
}

export interface ServiceCredentialContract extends AuthenticatedServiceCredentialContract {
  tokenPrefix: string;
  tokenSuffix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedServiceCredentialContract extends ServiceCredentialContract {
  token: string;
}

export interface LedgerProjectionEntryContract {
  id?: string;
  categoryId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt?: string;
}

export interface LedgerProjectionEntryFingerprint {
  id: string;
  amount: string;
  currency: string | null;
  sourceDocumentRevisionId: string | null;
}

export interface LedgerProjectionPort {
  activateRevision(input: {
    ledgerId: LedgerId;
    expectedMainCurrency: string;
    sourceDocumentId: SourceDocumentId;
    revisionId: RevisionId;
    title?: string | null;
    entries: readonly LedgerProjectionEntryContract[];
    lease?: ProcessingLeaseContract;
  }): Promise<boolean>;
  createManual(input: {
    ledgerId: LedgerId;
    expectedMainCurrency: string;
    sourceDocumentId?: SourceDocumentId;
    submittedText?: string | null;
    title?: string | null;
    entryDate?: string | null;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<{ sourceDocumentId: SourceDocumentId; revisionId: RevisionId }>;
  replaceManual(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    expectedActiveRevisionId?: RevisionId;
    submittedText?: string | null;
    title?: string | null;
    entryDate?: string | null;
    expectedMainCurrency?: string;
    expectedProjection?: readonly LedgerProjectionEntryFingerprint[];
    projectionConversions?: readonly {
      ledgerEntryId: string;
      convertedAmount: string;
      exchangeRate: string;
    }[];
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<RevisionId>;
  replaceActive(input: {
    ledgerId: LedgerId;
    sourceDocumentId: SourceDocumentId;
    expectedActiveRevisionId: RevisionId;
    expectedMainCurrency?: string;
    entries: readonly LedgerProjectionEntryContract[];
  }): Promise<RevisionId>;
  recalculate(input: {
    ledgerId: LedgerId;
    updates: readonly { ledgerEntryId: string; convertedAmount: string; exchangeRate: string }[];
  }): Promise<number>;
  softDelete(ledgerId: LedgerId, sourceDocumentId: SourceDocumentId): Promise<boolean>;
}
