import type {
  RecoverableProcessingIntentContract,
  CategoryPort,
  DirectStoredFilePort,
  LedgerPort,
  LedgerProjectionPort,
  SettingsPort,
  StoredFileContract,
  SourceDocumentPort,
  SourceDocumentSubmissionPort,
} from "@/application/contracts";
import type { FxRateBook } from "@/modules/currency/application/ports";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import type {
  BatchUpdateSourceDocumentsInput,
  UpdateSourceDocumentInput,
} from "../contract-schemas";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SourceDocumentCountsDto,
  SourceDocumentDto,
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
  UpdateSourceDocumentResultDto,
} from "../contracts";

export interface SourceDocumentFilterInput {
  ledgerId: string;
  ids?: readonly string[];
  statuses?: readonly SourceDocumentStatusType[];
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface SourceDocumentListInput extends SourceDocumentFilterInput {
  cursor?: string | null;
  limit: number;
  includeFiles?: boolean;
}

export interface SourceDocumentReadPort {
  calculateCompletedTotal(input: SourceDocumentFilterInput): Promise<{ total: string }>;
  counts(ledgerId: string): Promise<SourceDocumentCountsDto>;
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
  update(input: {
    ledgerId: string;
    sourceDocumentId: string;
    data: UpdateSourceDocumentInput;
  }): Promise<UpdateSourceDocumentResultDto>;
  batchUpdate(input: {
    ledgerId: string;
    sourceDocumentIds: string[];
    data: BatchUpdateSourceDocumentsInput;
  }): Promise<BatchUpdateSourceDocumentsResultDto>;
}

export interface SourceDocumentQueryPorts {
  documents: SourceDocumentReadPort;
  ledgerReads: LedgerReadPort;
}

export interface SourceDocumentCredentialPorts {
  ledgers: LedgerPort;
  settings: SettingsPort;
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
  categories: CategoryPort;
  projections: LedgerProjectionPort;
  rates: FxRateBook;
}

export type SourceDocumentRevisionPort = SourceDocumentPort;

export interface SourceDocumentLifecyclePort {
  acceptCandidate(ledgerId: string, sourceDocumentId: string, revisionId: string): Promise<boolean>;
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
    total: string;
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

export interface LedgerChangeBatchContract {
  version: bigint;
  resetRequired: boolean;
  countsChanged: boolean;
  categoriesChanged: boolean;
  settingsChanged: boolean;
  statsChanged: boolean;
}

export interface LedgerChangeReadPort {
  getVersion(ledgerId: string): Promise<bigint>;
  listBatches(input: {
    ledgerId: string;
    afterVersion: bigint;
    limit: number;
  }): Promise<LedgerChangeBatchContract[]>;
  listChangedSourceDocumentIds(input: {
    ledgerId: string;
    versions: bigint[];
    limit: number;
  }): Promise<string[]>;
}

export interface LedgerDeltaPorts extends SourceDocumentQueryPorts {
  changes: LedgerChangeReadPort;
}
