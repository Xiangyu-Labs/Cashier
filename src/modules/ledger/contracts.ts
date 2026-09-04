import type {
  SourceDocumentStatusType as SourceDocumentReferenceStatus,
  SourceDocumentTypeValue as SourceDocumentReferenceType,
} from "@/modules/source-document/types";

interface LedgerSettings {
  aiLanguage?: string;
  currencies?: string[];
  mainCurrency?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
  duplicateDetectionEnabled?: boolean;
  timeZone?: string | null;
}

export type LedgerDto = {
  id: string;
  userId: string;
  settings: LedgerSettings;
  createdAt: string;
  updatedAt: string;
};
export type Ledger = LedgerDto;

export type UpdateLedgerActionErrorCode =
  "rates_unavailable" | "unsupported_currency" | "validation_failed" | "conflict" | "unexpected";

export type UpdateLedgerActionResult =
  | { ok: true; ledger: LedgerDto }
  | { ok: false; code: UpdateLedgerActionErrorCode; dates?: string[] };

export type ServiceCredentialDto = {
  id: string;
  tokenPrefix: string;
  tokenSuffix: string;
  ledgerId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
};
export type ServiceCredential = ServiceCredentialDto;

export type CreatedServiceCredentialDto = ServiceCredentialDto & { token: string };
export type CreatedServiceCredential = CreatedServiceCredentialDto;

export type EntryCategoryDto = {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type EntryCategory = EntryCategoryDto;

export type EntryCategoryWithCountDto = EntryCategoryDto & { entryCount: number };
export type EntryCategoryWithCount = EntryCategoryWithCountDto;

interface SaveEntryCategoryTargetDto {
  id?: string;
  clientId?: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export interface SaveEntryCategoriesInput {
  expectedRevision: string;
  categories: SaveEntryCategoryTargetDto[];
}

export type SourceDocumentReferenceDto = {
  id: string;
  version: number;
  ledgerId: string;
  title: string | null;
  status: SourceDocumentReferenceStatus;
  type: SourceDocumentReferenceType;
  entryDate: string | null;
  createdAt: string;
  updatedAt: string;
  hasImages?: boolean;
};

export type LedgerEntryDto = {
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
  category?: EntryCategoryDto | null;
  sourceDocument?: SourceDocumentReferenceDto | null;
};
export type LedgerEntry = LedgerEntryDto;

export type LedgerEntryEmbeddedViewDto = Omit<LedgerEntryDto, "sourceDocument">;

type LedgerSettingsDto = {
  id?: string;
} & LedgerSettings;
export type Settings = LedgerSettingsDto;

export interface LedgerSummaryDto {
  unconvertedCount: number;
  convertedTotal: {
    total: string;
    currency: string;
  } | null;
  totals: {
    currency: string;
    total: string;
    count: number;
  }[];
  trend: {
    date: string;
    total: string;
  }[];
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    categoryIcon: string | null;
    currency: string | null;
    total: string;
    count: number;
  }[];
}
export type LedgerEntrySummary = LedgerSummaryDto;

export interface LedgerEntryPageDto {
  items: LedgerEntryDto[];
  nextCursor: string | null;
}

export interface LedgerSettingsViewDto {
  uncategorizedCount: number;
  credentials: ServiceCredentialDto[];
}

export interface DeleteLedgerEntryResultDto {
  ledgerEntryId: string;
  deleted: boolean;
  sourceDocumentId?: string;
}

export interface DeleteEntryCategoryResultDto {
  categoryId: string;
  deleted: boolean;
}

export interface ReorderEntryCategoriesResultDto {
  categoryIds: string[];
  reorderedCount: number;
}
