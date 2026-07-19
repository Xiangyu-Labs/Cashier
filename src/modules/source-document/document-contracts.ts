import type { SourceDocumentStatusType, SourceDocumentTypeValue } from "./types";
import type {
  ApplicationErrorCode,
  SupportedSourceDocumentAction,
} from "@/application/contracts";

export interface SourceDocumentStoredFileDto {
  id: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
}

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
  files: SourceDocumentStoredFileDto[];
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
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | null;
  pendingRevisionId: string | null;
}

export interface SourceDocumentCandidateProjectionSummary {
  entryCount: number;
  total: string;
}

export interface SourceDocumentCandidateComparisonDto {
  active: SourceDocumentCandidateProjectionSummary;
  candidate: SourceDocumentCandidateProjectionSummary;
  changed: boolean;
}

export interface SourceDocumentListItemDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: null;
  files: [];
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
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | null;
  pendingRevisionId: string | null;
  candidateComparison?: SourceDocumentCandidateComparisonDto;
}

export interface SourceDocumentLightDto {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  type: SourceDocumentTypeValue;
  anomalyReason: string | null;
  entryDate: string | null;
  createdAt: string;
  hasImages: boolean;
  supportedActions: SupportedSourceDocumentAction[];
  errorCode: ApplicationErrorCode | null;
  pendingRevisionId: string | null;
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

export interface SourceDocumentAttentionDto {
  items: SourceDocumentListItemDto[];
  total: number;
}

export interface SourceDocumentCountsDto {
  processingCount: number;
  attentionCount: number;
}

export interface SourceDocumentCompletedPageDto {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
}

export interface SourceDocumentFullDto {
  id: string;
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  status: SourceDocumentStatusType;
  createdAt: string;
}

export interface SourceDocumentLightWithEntriesDto extends SourceDocumentLightDto {
  ledgerEntries: SourceDocumentLedgerEntryDto[];
}
