import type { SourceDocumentStatusType, SourceDocumentTypeValue } from "@/persistence";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

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
  ledgerEntries?: LedgerEntryDto[];
  hasImages?: boolean;
};

export type SourceDocumentListItemDto = Omit<SourceDocumentDto, "text" | "imageUrls" | "ledgerEntries"> & {
  text: string | null;
  imageUrls: string[];
  ledgerEntries?: LedgerEntryDto[];
};

export type SourceDocumentLightDto = Omit<SourceDocumentDto, "ledgerEntries">;

export interface SourceDocumentGroupDto {
  sourceDocument: SourceDocumentDto;
  ledgerEntries: LedgerEntryDto[];
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
