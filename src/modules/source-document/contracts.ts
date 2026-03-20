export type { SourceDocumentStatusType, SourceDocumentTypeValue } from "./types";
export type {
  SourceDocumentCollectionDto,
  SourceDocumentDto,
  SourceDocumentEntryCategoryDto,
  SourceDocumentFullDto,
  SourceDocumentGroupDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightDto,
  SourceDocumentLightWithEntriesDto,
  SourceDocumentListItemDto,
  SourceDocumentPageDto,
} from "./document-contracts";

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
