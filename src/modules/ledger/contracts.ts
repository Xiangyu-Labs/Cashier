export interface LedgerSettings {
  aiLanguage?: string;
  currencies?: string[];
  mainCurrency?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
}

export interface LedgerMetadataDto {
  settings?: LedgerSettings;
}

export type LedgerDto = {
  id: string;
  userId: string;
  metadata: LedgerMetadataDto | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ServiceCredentialDto = {
  id: string;
  key: string;
  ledgerId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
};

export type EntryCategoryDto = {
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

export type EntryCategoryWithCountDto = EntryCategoryDto & { entryCount: number };

export type SourceDocumentReferenceStatus =
  | "queued"
  | "processing"
  | "completed"
  | "anomaly"
  | "failed";

export type SourceDocumentReferenceType = "ai_parsed" | "manual";

export type SourceDocumentReferenceDto = {
  id: string;
  ledgerId: string;
  title: string | null;
  text: string | null;
  imageUrls: string[];
  status: SourceDocumentReferenceStatus;
  type: SourceDocumentReferenceType;
  anomalyReason: string | null;
  entryDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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

export type LedgerEntryEmbeddedViewDto = Omit<LedgerEntryDto, "sourceDocument">;

export type LedgerSettingsDto = {
  id?: string;
} & LedgerSettings;

export interface LedgerSummaryDto {
  convertedTotal: {
    total: number;
    currency: string;
  } | null;
  totals: {
    currency: string;
    total: number;
    count: number;
  }[];
  trend: {
    date: string;
    total: number;
  }[];
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    categoryIcon: string | null;
    currency: string | null;
    total: number;
    count: number;
  }[];
}

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
}

export interface BatchLedgerEntriesMutationResultDto {
  ledgerEntryIds: string[];
  affectedCount: number;
}

export interface DeleteEntryCategoryResultDto {
  categoryId: string;
  deleted: boolean;
}

export interface ReorderEntryCategoriesResultDto {
  categoryIds: string[];
  reorderedCount: number;
}
