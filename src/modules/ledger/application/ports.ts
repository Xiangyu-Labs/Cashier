import type {
  DeleteLedgerEntryResultDto,
  LedgerEntryDto,
  LedgerEntryEmbeddedViewDto,
  LedgerEntrySummary,
} from "../contracts";
import type { LedgerEntryFilterParams } from "../filters";
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
  }): Promise<{ items: LedgerEntryDto[]; nextCursor: string | undefined }>;
  calculateStats(input: {
    ledgerId: string;
    filters: LedgerEntryFilterParams;
    mainCurrency?: string;
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
