import type {
  DeleteLedgerEntryResultDto,
  LedgerEntryDto,
  LedgerEntryEmbeddedViewDto,
  LedgerEntrySummary,
} from "../contracts";
import type { LedgerEntryFilterParams } from "../filters";
import type {
  AtomicBatchCommandResult,
  PartialBatchCommandResult,
  VersionedCommandResult,
  VersionedTarget,
} from "@/modules/source-document/contracts";
import type { BatchActionResult } from "@/lib/batch-ids";

export interface BatchEntryDateImpact {
  selectedEntryCount: number;
  sourceDocumentCount: number;
  affectedEntryCount: number;
  sourceDocumentIds: string[];
}

export interface CategoryMetadataGeneratorPort {
  generate(input: {
    categoryName: string;
    existingCategoryNames: readonly string[];
    language?: string;
    customPrompt?: string;
  }): Promise<{ icon: string; description: string }>;
}

export interface LedgerReadPort {
  hasActiveEntries(ledgerId: string): Promise<boolean>;
  getEntry(id: string, ledgerId: string): Promise<LedgerEntryDto | null>;
  listEntries(input: {
    ledgerId: string;
    limit?: number;
    cursor?: string | null;
    filters: LedgerEntryFilterParams;
  }): Promise<{ items: LedgerEntryDto[]; nextCursor: string | null }>;
  calculateStats(input: {
    ledgerId: string;
    filters: LedgerEntryFilterParams;
  }): Promise<LedgerEntrySummary>;
  getBatchEntryDateImpact(input: {
    ledgerId: string;
    ledgerEntryIds: string[];
  }): Promise<BatchEntryDateImpact>;
  listEntriesBySourceDocumentIds(input: {
    ledgerId: string;
    sourceDocumentIds: string[];
    /** Also load pending-revision entries of duplicate_pending documents. */
    includeDuplicatePending?: boolean;
  }): Promise<Map<string, LedgerEntryEmbeddedViewDto[]>>;
}

export interface LedgerMutationPort {
  createEntry(input: {
    ledgerId: string;
    ledgerEntryId?: string;
    amount: string;
    currency?: string;
    itemName: string;
    categoryId?: string;
    description?: string | null;
    sourceDocumentId: string;
  }): Promise<LedgerEntryDto>;
  updateEntry(input: {
    ledgerId: string;
    ledgerEntryId: string;
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  }): Promise<LedgerEntryDto>;
  batchUpdateEntries(input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    categoryId?: string | null;
    currency?: string | null;
    amount?: string;
    description?: string | null;
    itemName?: string;
  }): Promise<number>;
  deleteEntry(ledgerId: string, ledgerEntryId: string): Promise<DeleteLedgerEntryResultDto>;
  batchDeleteEntries(ledgerId: string, ledgerEntryIds: string[]): Promise<BatchActionResult>;
}

export interface LedgerEntryCommandPort {
  create(input: {
    ledgerId: string;
    target: VersionedTarget;
    amount: string;
    currency?: string;
    itemName: string;
    categoryId?: string;
    description?: string | null;
  }): Promise<VersionedCommandResult<{ ledgerEntryId: string }>>;
  update(input: {
    ledgerId: string;
    target: VersionedTarget;
    ledgerEntryId: string;
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  }): Promise<VersionedCommandResult<{ ledgerEntryId: string }>>;
  delete(input: {
    ledgerId: string;
    target: VersionedTarget;
    ledgerEntryId: string;
  }): Promise<VersionedCommandResult<{ ledgerEntryId: string; deleted: true }>>;
  batchUpdate(input: {
    ledgerId: string;
    targets: VersionedTarget[];
    ledgerEntryIds: string[];
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  }): Promise<AtomicBatchCommandResult<{ ledgerEntryIds: string[]; affectedCount: number }>>;
  batchDelete(input: {
    ledgerId: string;
    targets: VersionedTarget[];
    ledgerEntryIds: string[];
  }): Promise<PartialBatchCommandResult>;
}
