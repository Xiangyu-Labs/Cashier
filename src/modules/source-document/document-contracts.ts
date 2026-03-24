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

export interface SourceDocumentDto {
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
}

export interface SourceDocumentListItemDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: null;
  imageUrls: [];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, never>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
  hasImages: boolean;
}

export interface SourceDocumentLightDto {
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
  hasImages: boolean;
}

export interface SourceDocumentGroupDto {
  sourceDocument: SourceDocumentListItemDto;
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}

export interface SourceDocumentPageDto {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
}

export interface SourceDocumentCollectionDto {
  items: SourceDocumentListItemDto[];
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
