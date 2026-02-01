import { type Ledger as DbLedger, type EntryCategory as DbEntryCategory, type LedgerEntry as DbLedgerEntry, type ServiceCredential as DbServiceCredential } from "@/features/ledger/server/schema";
import { type SourceDocument as DbSourceDocument } from "@/features/source-document/server/schema";
import { Serialized } from "./utils";

// Re-export Serialized wrapper types
export type Ledger = Serialized<DbLedger>;
export type ServiceCredential = Serialized<DbServiceCredential>;
export type EntryCategory = Serialized<DbEntryCategory>;
export type SourceDocument = Serialized<DbSourceDocument>;

// Extended types
export type LedgerEntry = Serialized<DbLedgerEntry> & {
  category?: EntryCategory | null;
  sourceDocument?: SourceDocument | null;
};

// Derived types (subsets or composites)
export interface Settings {
  id: string;
  aiLanguage: string;
  currencies: string[];
  mainCurrency?: string;
  autoRecognizeDate?: boolean;
}

export interface ShareData {
  sourceDocument: {
    id: string;
    title: string | null;
    text: string | null;
    imageUrls: string[];
    createdAt: string;
  };
  entries: {
    id: string;
    amount: string;
    currency: string | null;
    itemName: string;
    description: string | null;
    entryDate: string | null;
    category: {
      id: string;
      name: string;
      icon: string | null;
    } | null;
  }[];
  ledgerId: string;
}

export interface LedgerEntrySummary {
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    categoryIcon: string | null;
    currency: string | null;
    total: number;
    count: number;
  }[];
  totals: {
    currency: string | null;
    total: number;
    count: number;
  }[];
  trend: {
    date: string;
    total: number;
  }[];
  convertedTotal?: {
    currency: string;
    total: number;
    conversions: {
      fromCurrency: string | null;
      originalTotal: number;
      convertedTotal: number;
      count: number;
    }[];
  };
}

export interface SourceDocumentResponse {
  sourceDocumentId: string;
  ledgerEntries: LedgerEntry[];
}
