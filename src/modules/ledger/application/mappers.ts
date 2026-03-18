import type {
  EntryCategory,
  Ledger,
  LedgerEntry,
  ServiceCredential,
  SourceDocument,
} from "@/persistence";
import type {
  EntryCategoryDto,
  LedgerDto,
  LedgerEntryDto,
  ServiceCredentialDto,
  SourceDocumentReferenceDto,
} from "../contracts";

function toIso(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

export function mapLedgerDto(ledger: Ledger): LedgerDto {
  return {
    id: ledger.id,
    userId: ledger.userId,
    metadata: ledger.metadata,
    createdAt: toIso(ledger.createdAt)!,
    updatedAt: toIso(ledger.updatedAt)!,
    deletedAt: toIso(ledger.deletedAt),
  };
}

export function mapEntryCategoryDto(category: EntryCategory): EntryCategoryDto {
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

export function mapServiceCredentialDto(credential: ServiceCredential): ServiceCredentialDto {
  return {
    id: credential.id,
    key: credential.key,
    ledgerId: credential.ledgerId,
    name: credential.name,
    createdAt: toIso(credential.createdAt)!,
    lastUsedAt: toIso(credential.lastUsedAt),
    deletedAt: toIso(credential.deletedAt),
  };
}

export function mapSourceDocumentReferenceDto(
  doc: Pick<
    SourceDocument,
    | "id"
    | "ledgerId"
    | "title"
    | "text"
    | "imageUrls"
    | "status"
    | "type"
    | "anomalyReason"
    | "entryDate"
    | "metadata"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  >
): SourceDocumentReferenceDto {
  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    text: doc.text,
    imageUrls: doc.imageUrls ?? [],
    status: doc.status,
    type: doc.type,
    anomalyReason: doc.anomalyReason,
    entryDate: doc.entryDate,
    metadata: (doc.metadata ?? {}) as Record<string, unknown>,
    createdAt: toIso(doc.createdAt)!,
    updatedAt: toIso(doc.updatedAt)!,
    deletedAt: toIso(doc.deletedAt),
    hasImages: (doc.imageUrls?.length ?? 0) > 0,
  };
}

export function mapLedgerEntryDto(
  entry: LedgerEntry & {
    category?: EntryCategory | null;
    sourceDocument?: SourceDocument | null;
  }
): LedgerEntryDto {
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
    exchangeRate: entry.exchangeRate,
    createdAt: toIso(entry.createdAt)!,
    updatedAt: toIso(entry.updatedAt)!,
    deletedAt: toIso(entry.deletedAt),
    category: entry.category ? mapEntryCategoryDto(entry.category) : undefined,
    sourceDocument: entry.sourceDocument
      ? mapSourceDocumentReferenceDto(entry.sourceDocument)
      : undefined,
  };
}
