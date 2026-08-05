import { compare } from "@/lib/money/decimal";
import type {
  EntryCategoryDto,
  LedgerDto,
  LedgerEntryEmbeddedViewDto,
  LedgerEntryDto,
  ServiceCredentialDto,
  SourceDocumentReferenceDto,
} from "@/modules/ledger/contracts";

type DateFields = { createdAt: Date; updatedAt: Date; deletedAt: Date | null };
type LedgerRow = {
  id: string;
  userId: string;
  aiLanguage: string;
  preferredCurrencies: string[];
  mainCurrency: string;
  collapseEntriesDefault: boolean;
  aiCustomPrompt: string;
  duplicateDetectionEnabled: boolean;
  timeZone: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type EntryCategoryRow = Omit<EntryCategoryDto, "createdAt" | "updatedAt" | "deletedAt"> &
  DateFields;
type ServiceCredentialRow = Omit<ServiceCredentialDto, "createdAt" | "lastUsedAt" | "deletedAt"> & {
  createdAt: Date;
  lastUsedAt: Date | null;
  deletedAt: Date | null;
};
type SourceDocumentRow = Pick<
  SourceDocumentReferenceDto,
  "id" | "ledgerId" | "title" | "type" | "entryDate"
> &
  DateFields & {
    currentStatus: SourceDocumentReferenceDto["status"];
  };
type LedgerEntryRow = Omit<
  LedgerEntryDto,
  "createdAt" | "updatedAt" | "deletedAt" | "category" | "sourceDocument"
> &
  DateFields;

function toIso(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

function mapExchangeRate(value: string | null): string | null {
  return value != null && compare(value, "1") === 0 ? "1" : value;
}

export function mapLedgerDto(ledger: LedgerRow): LedgerDto {
  return {
    id: ledger.id,
    userId: ledger.userId,
    settings: {
      aiLanguage: ledger.aiLanguage,
      currencies: ledger.preferredCurrencies,
      mainCurrency: ledger.mainCurrency,
      collapseEntriesDefault: ledger.collapseEntriesDefault,
      aiCustomPrompt: ledger.aiCustomPrompt,
      duplicateDetectionEnabled: ledger.duplicateDetectionEnabled,
      timeZone: ledger.timeZone,
    },
    createdAt: toIso(ledger.createdAt)!,
    updatedAt: toIso(ledger.updatedAt)!,
  };
}

export function mapEntryCategoryDto(category: EntryCategoryRow): EntryCategoryDto {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    name: category.name,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isEditable: category.isEditable,
    createdAt: toIso(category.createdAt)!,
    updatedAt: toIso(category.updatedAt)!,
    deletedAt: toIso(category.deletedAt),
  };
}

export function mapServiceCredentialDto(credential: ServiceCredentialRow): ServiceCredentialDto {
  return {
    id: credential.id,
    tokenPrefix: credential.tokenPrefix ?? "",
    tokenSuffix: credential.tokenSuffix ?? "",
    ledgerId: credential.ledgerId,
    name: credential.name,
    createdAt: toIso(credential.createdAt)!,
    lastUsedAt: toIso(credential.lastUsedAt),
    deletedAt: toIso(credential.deletedAt),
  };
}

export function mapSourceDocumentReferenceDto(
  doc: Pick<
    SourceDocumentRow,
    | "id"
    | "ledgerId"
    | "title"
    | "type"
    | "entryDate"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
    | "currentStatus"
  >
): SourceDocumentReferenceDto {
  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    // Ledger-entry references describe the active accounting projection.
    // Duplicate-pending is the one active status that remains actionable in
    // the UI; retry/anomaly states still expose their retained completed
    // projection as completed for compatibility.
    status: doc.currentStatus === "duplicate_pending" ? "duplicate_pending" : "completed",
    type: doc.type,
    entryDate: doc.entryDate,
    createdAt: toIso(doc.createdAt)!,
    updatedAt: toIso(doc.updatedAt)!,
    hasImages: false,
  };
}

export function mapLedgerEntryEmbeddedViewDto(
  entry: Pick<
    LedgerEntryRow,
    | "id"
    | "ledgerId"
    | "categoryId"
    | "sourceDocumentId"
    | "amount"
    | "currency"
    | "itemName"
    | "description"
    | "convertedAmount"
    | "exchangeRate"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  > & {
    category?: EntryCategoryRow | null;
  }
): LedgerEntryEmbeddedViewDto {
  return {
    id: entry.id,
    ledgerId: entry.ledgerId,
    categoryId: entry.categoryId,
    sourceDocumentId: entry.sourceDocumentId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate: mapExchangeRate(entry.exchangeRate),
    createdAt: toIso(entry.createdAt)!,
    updatedAt: toIso(entry.updatedAt)!,
    deletedAt: toIso(entry.deletedAt),
    ...(entry.category ? { category: mapEntryCategoryDto(entry.category) } : {}),
  };
}

export function mapLedgerEntryDto(
  entry: Pick<
    LedgerEntryRow,
    | "id"
    | "ledgerId"
    | "categoryId"
    | "sourceDocumentId"
    | "amount"
    | "currency"
    | "itemName"
    | "description"
    | "convertedAmount"
    | "exchangeRate"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  > & {
    category?: EntryCategoryRow | null;
    sourceDocument?: SourceDocumentRow | null;
  }
): LedgerEntryDto {
  return {
    ...mapLedgerEntryEmbeddedViewDto(entry),
    ...(entry.sourceDocument
      ? { sourceDocument: mapSourceDocumentReferenceDto(entry.sourceDocument) }
      : {}),
  };
}
