import type {
  RecoverableProcessingIntentContract,
  CategoryPort,
  DirectStoredFilePort,
  LedgerProjectionPort,
  StoredFileContract,
  SourceDocumentPort,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
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
} from "../contracts";

interface SourceDocumentFilterInput {
  ledgerId: string;
  ids?: readonly string[];
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
  includeFiles?: boolean;
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
    sourceDocumentIds: string[];
    data: BatchUpdateSourceDocumentsInput;
  }): Promise<BatchUpdateSourceDocumentsResultDto>;
  saveChangesAtomically(input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedRevisionId: string;
    operationId: string;
    sourceDocument?: UpdateSourceDocumentInput;
    entries: Array<{
      ledgerEntryId: string;
      data: import("@/modules/ledger/contract-schemas").UpdateLedgerEntryInput;
    }>;
  }): Promise<SaveSourceDocumentChangesResultDto>;
  split(input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedRevisionId: string;
    operationId: string;
    newSourceDocumentId: string;
    ledgerEntryIds: string[];
    entryDate: string;
  }): Promise<SplitSourceDocumentResultDto>;
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
    revisionId: string
  ): Promise<"completed" | "duplicate_pending">;
  abandonCandidate(
    ledgerId: string,
    sourceDocumentId: string,
    revisionId: string
  ): Promise<boolean>;
  keepDuplicate(ledgerId: string, sourceDocumentId: string, revisionId: string): Promise<boolean>;
  discardDuplicate(
    ledgerId: string,
    sourceDocumentId: string,
    revisionId: string
  ): Promise<boolean>;
  cancelPending(
    ledgerId: string,
    sourceDocumentId: string,
    revisionId: string
  ): Promise<import("../contracts").CancelProcessingResponseDto>;
}

export interface ProcessingRecoveryPort {
  reconcileResidualIntents(ledgerId: string, limit: number): Promise<number>;
  exhaustStaleIntents(ledgerId: string, maxAttempts: number, limit: number): Promise<number>;
  selectRecoverable(
    ledgerId: string,
    maxAttempts: number,
    limit: number
  ): Promise<readonly RecoverableProcessingIntentContract[]>;
  scheduleRecovery(
    revisionId: string,
    intentId: string,
    ledgerId: string,
    cooldownSeconds: number
  ): Promise<boolean>;
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
