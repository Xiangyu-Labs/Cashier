import {
  type Ledger as DbLedger,
  type EntryCategory as DbEntryCategory,
  type LedgerEntry as DbLedgerEntry,
  type ServiceCredential as DbServiceCredential
} from "@/features/ledger/server/schema";
import { type SourceDocument as DbSourceDocument } from "@/features/source-document/server/schema";
import { type TaskRun as DbTaskRun } from "@/features/tasks/server/schema";
import { type User as DbUser } from "@/features/auth/server/schema";
import { type CurrencyRate as DbCurrencyRate } from "@/features/currency/server/schema";
import { Serialized } from "./utils";

// Re-export Serialized wrapper types
export type Ledger = Serialized<DbLedger>;
export type ServiceCredential = Serialized<DbServiceCredential>;
export type EntryCategory = Serialized<DbEntryCategory>;
// Extended type with entry count for category management
export type EntryCategoryWithCount = EntryCategory & { entryCount: number };
export type SourceDocument = Serialized<DbSourceDocument>;
export type TaskRun = Serialized<DbTaskRun>;
export type User = Serialized<DbUser>;
export type CurrencyRate = Serialized<DbCurrencyRate>;

// Light version of SourceDocument without large payload fields (imageUrls, aiRawResponse, rawOcrText)
// Used in list views to reduce payload size
export type SourceDocumentLight = Omit<SourceDocument, 'imageUrls' | 'metadata'> & {
  hasImages?: boolean;
  metadata?: Omit<NonNullable<SourceDocument['metadata']>, 'aiRawResponse' | 'rawOcrText'> | null;
};

// Extended types
export type LedgerEntry = Serialized<DbLedgerEntry> & {
  category?: EntryCategory | null;
  sourceDocument?: SourceDocumentLight | null;
};

// Derived types (subsets or composites)
// Settings is a subset of Ledger fields used for configuration
// Since we now use metadata, we need to extract from there or define manually
import { LedgerMetadata } from "@/features/ledger/server/schema";

export type Settings = {
  id: string;
} & NonNullable<LedgerMetadata["settings"]>;


export interface LedgerEntrySummary {
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

export interface SourceDocumentResponse {
  sourceDocumentId: string;
  ledgerEntries: LedgerEntry[];
}
