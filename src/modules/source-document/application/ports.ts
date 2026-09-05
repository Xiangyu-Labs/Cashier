import type {
  RecoverableProcessingIntentContract,
  CategoryPort,
  DirectStoredFilePort,
  LedgerProjectionPort,
  StoredFileContract,
  SourceDocumentPort,
  SourceDocumentIdempotencyInput,
  SourceDocumentSubmissionInput,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import type { LedgerEntryCommandPort } from "@/modules/ledger/application/ports";
import type {
  BatchUpdateSourceDocumentsInput,
  UpdateSourceDocumentInput,
} from "../contract-schemas";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SaveSourceDocumentChangesResultDto,
  SourceDocumentCandidateReviewDto,
  SplitSourceDocumentResultDto,
  SourceDocumentDto,
  SourceDocumentDuplicateReviewDetailDto,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
  AtomicBatchCommandResult,
  PartialBatchCommandResult,
  VersionedCommandResult,
  VersionedTarget,
} from "../contracts";

interface SourceDocumentFilterInput {
  ledgerId: string;
  statuses?: readonly SourceDocumentStatusType[];
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: string;
  maxAmount?: string;
  search?: string;
}

export interface PendingDuplicateReviewContract {
  sourceDocumentId: string;
  revisionId: string;
}

interface SourceDocumentListInput extends SourceDocumentFilterInput {
  cursor?: string | null;
  limit: number;
}

export interface SourceDocumentReadPort {
  calculateCompletedTotal(input: SourceDocumentFilterInput): Promise<{
    total: string;
    unconvertedCount: number;
  }>;
  candidateReview(
    ledgerId: string,
    sourceDocumentId: string
  ): Promise<SourceDocumentCandidateReviewDto>;
  duplicateReview(
    ledgerId: string,
    sourceDocumentId: string
  ): Promise<SourceDocumentDuplicateReviewDetailDto>;
  listPendingDuplicateReviews(
    ledgerId: string,
    sourceDocumentIds: readonly string[]
  ): Promise<PendingDuplicateReviewContract[]>;
  get(ledgerId: string, sourceDocumentId: string): Promise<SourceDocumentDto | null>;
  getAccessContext(
    sourceDocumentId: string
  ): Promise<{ ledgerId: string; hasImages: boolean } | null>;
  list(input: SourceDocumentListInput): Promise<{
    items: SourceDocumentListItemDto[];
    nextCursor: string | null;
  }>;
}

export interface SourceDocumentUpdatePort {
  batchUpdate(input: {
    ledgerId: string;
    targets: VersionedTarget[];
    data: BatchUpdateSourceDocumentsInput;
  }): Promise<AtomicBatchCommandResult<BatchUpdateSourceDocumentsResultDto>>;
  saveChangesAtomically(input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedVersion: number;
    sourceDocument?: UpdateSourceDocumentInput;
    entries: Array<{
      ledgerEntryId: string;
      data: import("@/modules/ledger/contract-schemas").UpdateLedgerEntryInput;
    }>;
  }): Promise<VersionedCommandResult<SaveSourceDocumentChangesResultDto>>;
  split(input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedVersion: number;
    ledgerEntryIds: string[];
    entryDate: string;
  }): Promise<VersionedCommandResult<SplitSourceDocumentResultDto>>;
}

/** The only application-facing boundary for writes that change a document's visible projection. */
export interface SourceDocumentAggregateWritePort {
  createProcessingDocument: SourceDocumentSubmissionPort["createPendingWithIntent"];
  createIdempotentProcessingDocument: (
    idempotency: SourceDocumentIdempotencyInput,
    prepare: () => Promise<SourceDocumentSubmissionInput>
  ) => ReturnType<SourceDocumentSubmissionPort["createIdempotentPendingWithIntent"]>;
  createManualDocument: LedgerProjectionPort["createManual"];
  saveChanges: SourceDocumentUpdatePort["saveChangesAtomically"];
  updateDocuments: SourceDocumentUpdatePort["batchUpdate"];
  updateEntryDates(input: {
    ledgerId: string;
    targets: VersionedTarget[];
    ledgerEntryIds: string[];
    entryDate: string;
  }): Promise<
    AtomicBatchCommandResult<{
      impact: import("@/modules/ledger/application/ports").BatchEntryDateImpact;
    }>
  >;
  addEntry: LedgerEntryCommandPort["create"];
  updateEntries: LedgerEntryCommandPort["update"];
  deleteEntries: LedgerEntryCommandPort["delete"];
  batchUpdateEntries: LedgerEntryCommandPort["batchUpdate"];
  batchDeleteEntries: LedgerEntryCommandPort["batchDelete"];
  splitEntries: SourceDocumentUpdatePort["split"];
  installRetry(
    input: SourceDocumentSubmissionInput & { sourceDocumentId: string; expectedVersion: number }
  ): ReturnType<SourceDocumentSubmissionPort["createPendingWithIntent"]>;
  acceptCandidate: SourceDocumentLifecyclePort["acceptCandidate"];
  abandonCandidate: SourceDocumentLifecyclePort["abandonCandidate"];
  cancelProcessing: SourceDocumentLifecyclePort["cancelPending"];
  resolveDuplicate(input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedVersion: number;
    decision: "keep" | "discard";
  }): Promise<{ version: number; status: "completed" | "deleted" } | null>;
  deleteDocuments(input: {
    ledgerId: string;
    target: VersionedTarget;
  }): Promise<VersionedCommandResult<import("../contracts").DeleteSourceDocumentResultDto>>;
  deleteDocumentsBatch?: (
    ledgerId: string,
    targets: VersionedTarget[]
  ) => Promise<PartialBatchCommandResult>;
  completeProcessing: LedgerProjectionPort["activateRevision"];
  applyMainCurrencyChange: LedgerProjectionPort["recalculate"];
  recalculateConversions: LedgerProjectionPort["recalculate"];
}

export interface SourceDocumentQueryPorts {
  documents: SourceDocumentReadPort;
  ledgerReads: LedgerReadPort;
  changes?: LedgerChangeReadPort;
}

export interface SourceDocumentCredentialPorts {
  submissions: SourceDocumentSubmissionPort;
  storedFiles: DirectStoredFilePort & {
    uploadTarget(input: {
      ledgerId: string;
      uploadSessionId: string;
      targetId: string;
      contentType: string;
      body: Uint8Array;
    }): Promise<StoredFileContract>;
  };
}

export interface QuickEntryPorts {
  categories: Pick<CategoryPort, "get">;
  projections: Pick<LedgerProjectionPort, "createManual">;
  convertAmount(input: {
    amount: string;
    fromCurrency: string;
    toCurrency: string;
    date?: string;
  }): Promise<{ convertedAmount: string; exchangeRate: string }>;
}

export type SourceDocumentRevisionPort = SourceDocumentPort;

export interface SourceDocumentLifecyclePort {
  acceptCandidate(
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ): Promise<{ version: number; status: "completed" | "duplicate_pending" }>;
  abandonCandidate(
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ): Promise<{ version: number; status: "completed" | "duplicate_pending" } | null>;
  keepDuplicate(
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ): Promise<{ version: number; status: "completed" } | null>;
  discardDuplicate(
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ): Promise<{ version: number; status: "deleted" } | null>;
  cancelPending(
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ): Promise<{
    version: number;
    status: "cancelled" | "completed" | "duplicate_pending";
  }>;
}

export interface ProcessingRecoveryPort {
  recoverBatch(
    ledgerId: string,
    config: import("@/application/contracts").ProcessingRecoveryConfig
  ): Promise<readonly RecoverableProcessingIntentContract[]>;
}

export interface CredentialSourceDocumentStatusResult {
  sourceDocumentId: string;
  revisionId: string;
  status: "processing" | "completed" | "anomaly" | "failed" | "cancelled";
  submittedAt: string;
  finalizedAt: string | null;
  entryDate: string | null;
  result: null | {
    title: string | null;
    /** Accounting total in the ledger's main currency (convertedAmount sum). */
    total: string;
    /** Three-letter ISO currency code of `total`, from the ledger's main currency. */
    totalCurrency: string;
    entries: Array<{
      name: string;
      description: string | null;
      amount: string;
      currency: string | null;
      category: string | null;
    }>;
  };
  error: null | { code: string };
}

export interface CredentialSourceDocumentReadPort {
  getStatus(
    ledgerId: string,
    sourceDocumentId: string
  ): Promise<CredentialSourceDocumentStatusResult | null>;
}

export interface LedgerChangeReadPort {
  getVersion(ledgerId: string): Promise<bigint>;
  getRefreshBaseline(ledgerId: string): Promise<{ version: bigint; hasTransitionalWork: boolean }>;
  summarizeChanges(input: { ledgerId: string; afterVersion: bigint }): Promise<{
    currentVersion: bigint;
    firstRetainedVersion: bigint | null;
    lastRetainedVersion: bigint | null;
    categoriesChanged: boolean;
    settingsChanged: boolean;
    statsChanged: boolean;
    resetRequired: boolean;
    hasTransitionalWork: boolean;
  }>;
}
