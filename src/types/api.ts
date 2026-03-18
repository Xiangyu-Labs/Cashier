export type {
  LedgerDto as Ledger,
  ServiceCredentialDto as ServiceCredential,
  EntryCategoryDto as EntryCategory,
  EntryCategoryWithCountDto as EntryCategoryWithCount,
  LedgerEntryDto as LedgerEntry,
  LedgerSettingsDto as Settings,
  LedgerSummaryDto as LedgerEntrySummary,
} from "@/modules/ledger/contracts";

export type {
  SourceDocumentDto as SourceDocument,
  SourceDocumentLightDto as SourceDocumentLight,
} from "@/modules/source-document/contracts";

export type { AuthenticatedUserDto as User } from "@/modules/auth/contracts";
export type { CurrencyRate, TaskRun } from "@/persistence";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

export interface SourceDocumentResponse {
  sourceDocumentId: string;
  ledgerEntries: LedgerEntryDto[];
}
