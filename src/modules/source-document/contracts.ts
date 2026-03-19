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

export type SourceDocumentListItemDto = Omit<SourceDocumentDto, "text" | "imageUrls" | "ledgerEntries"> & {
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
