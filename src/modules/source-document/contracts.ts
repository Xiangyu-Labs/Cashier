import type { SourceDocumentStatusType, SourceDocumentTypeValue } from "./types";

export type SourceDocumentEntryCategoryDto = {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SourceDocumentLedgerEntryDto = {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  sourceDocumentId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: SourceDocumentEntryCategoryDto | null;
};

export type SourceDocumentDto = {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages?: boolean;
};

export type SourceDocumentListItemDto = Omit<
  SourceDocumentDto,
  "text" | "imageUrls" | "ledgerEntries"
> & {
  text: string | null;
  imageUrls: string[];
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
};

export type SourceDocumentLightDto = Omit<SourceDocumentDto, "ledgerEntries" | "imageUrls"> & {
  imageUrls?: string[];
};

export interface SourceDocumentGroupDto {
  sourceDocument: SourceDocumentDto;
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}

export interface CreateSourceDocumentInput {
  text?: string;
  images?: { data: string; mimeType: string }[];
  originalImages?: { data: string; mimeType: string }[];
  entryDate?: string;
  timezone?: string;
}

export interface CreateSourceDocumentResponseDto {
  sourceDocumentId: string;
  status: "queued";
}

export interface RetrySourceDocumentResponseDto {
  sourceDocumentId: string;
  previousSourceDocumentId: string;
  status: "queued";
}

export interface QuickEntryResponseDto {
  sourceDocumentId: string;
  ledgerEntryId: string;
  status: "completed";
}

export interface PendingSourceDocumentsResponseDto {
  groups: {
    queued: SourceDocumentGroupDto[];
    processing: SourceDocumentGroupDto[];
    anomaly: SourceDocumentGroupDto[];
    failed: SourceDocumentGroupDto[];
  };
  stats: {
    queuedCount: number;
    processingCount: number;
    anomalyCount: number;
    failedCount: number;
    total: number;
  };
}

export interface SourceDocumentPageDto {
  items: SourceDocumentDto[];
  nextCursor: string | null;
}

export interface SourceDocumentCollectionDto {
  items: SourceDocumentDto[];
  hasMore: boolean;
  total: number;
}

export interface SourceDocumentFullDto {
  id: string;
  text: string | null;
  imageUrls: string[];
  status: SourceDocumentStatusType;
  createdAt: string;
}

export interface SourceDocumentLightWithEntriesDto extends SourceDocumentLightDto {
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}

export interface UpdateSourceDocumentResultDto {
  sourceDocumentId: string;
  updated: boolean;
}

export interface BatchUpdateSourceDocumentsResultDto {
  sourceDocumentIds: string[];
  updatedCount: number;
}

export interface DeleteSourceDocumentResultDto {
  sourceDocumentId: string;
  deleted: boolean;
}

export interface BatchDeleteSourceDocumentsResultDto {
  sourceDocumentIds: string[];
  deletedCount: number;
}

export interface BatchRetrySourceDocumentItemDto {
  previousSourceDocumentId: string;
  sourceDocumentId: string;
  status: "queued";
  taskSubmitted: boolean;
}

export interface BatchRetrySourceDocumentsResultDto {
  results: BatchRetrySourceDocumentItemDto[];
  retriedCount: number;
  failedCount: number;
}

export type ProcessingTaskStatusDto = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ProcessingTaskDto {
  id: string;
  type: string;
  title: string;
  input: unknown;
  deduplicationKey: string | null;
  scopeId: string | null;
  entityType: string | null;
  entityId: string | null;
  status: ProcessingTaskStatusDto;
  error: string | null;
  progress: string | null;
  tokenUsage: Record<string, { input?: number; output?: number } | undefined> | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
}

export interface ProcessingStatsDto {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  taskCount: number;
  averageTokensPerTask: number;
}
