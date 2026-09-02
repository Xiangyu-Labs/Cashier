import { compare } from "@/lib/money/decimal";
import type {
  EntryCategoryDto,
  LedgerEntryEmbeddedViewDto,
  LedgerEntryDto,
  SourceDocumentReferenceDto,
} from "@/modules/ledger/contracts";

type DateFields = { createdAt: Date; updatedAt: Date; deletedAt: Date | null };
type EntryCategoryRow = Omit<EntryCategoryDto, "createdAt" | "updatedAt" | "deletedAt"> &
  DateFields;
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

function mapEntryCategoryDto(category: EntryCategoryRow): EntryCategoryDto {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    name: category.name,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    createdAt: toIso(category.createdAt)!,
    updatedAt: toIso(category.updatedAt)!,
    deletedAt: toIso(category.deletedAt),
  };
}

function mapSourceDocumentReferenceDto(
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
