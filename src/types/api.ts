import {
  type Ledger as DbLedger,
  type EntryCategory as DbEntryCategory,
  type LedgerEntry as DbLedgerEntry,
  type ServiceCredential as DbServiceCredential
} from "@/features/ledger/server/schema";
import { type SourceDocument as DbSourceDocument } from "@/features/source-document/server/schema";
import { type Share as DbShare, type ShareAccessLog as DbShareAccessLog } from "@/features/share/server/schema";
import { type TaskRun as DbTaskRun } from "@/features/tasks/server/schema";
import { type User as DbUser } from "@/features/auth/server/schema";
import { type CurrencyRate as DbCurrencyRate } from "@/features/currency/server/schema";
import { Serialized } from "./utils";

// Re-export Serialized wrapper types
export type Ledger = Serialized<DbLedger>;
export type ServiceCredential = Serialized<DbServiceCredential>;
export type EntryCategory = Serialized<DbEntryCategory>;
export type SourceDocument = Serialized<DbSourceDocument>;
export type Share = Serialized<DbShare>;
export type ShareAccessLog = Serialized<DbShareAccessLog>;
export type TaskRun = Serialized<DbTaskRun>;
export type User = Serialized<DbUser>;
export type CurrencyRate = Serialized<DbCurrencyRate>;

// Extended types
export type LedgerEntry = Serialized<DbLedgerEntry> & {
  category?: EntryCategory | null;
  sourceDocument?: SourceDocument | null;
};

// Derived types (subsets or composites)
// Settings is a subset of Ledger fields used for configuration
export type Settings = Pick<
  Ledger,
  "id" | "aiLanguage" | "currencies" | "mainCurrency" | "autoRecognizeDate" |
  "collapseProcessingDefault" | "mergeSimilarItems" | "collapseBillsDefault" | "aiCustomPrompt"
>;

export interface ShareData {
  sourceDocument: Pick<SourceDocument, "id" | "title" | "text" | "imageUrls" | "createdAt">;
  entries: (Pick<LedgerEntry, "id" | "amount" | "currency" | "itemName" | "description" | "entryDate"> & {
    category: Pick<EntryCategory, "id" | "name" | "icon"> | null;
  })[];
  ledgerId: string;
}

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
