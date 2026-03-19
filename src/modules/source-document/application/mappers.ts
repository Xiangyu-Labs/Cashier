import type { SourceDocument } from "@/persistence";
import type {
  SourceDocumentEntryCategoryDto,
  SourceDocumentDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentGroupDto,
  SourceDocumentListItemDto,
} from "../contracts";

function toIso(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

export function mapSourceDocumentDto(
  doc: SourceDocument,
  options: {
    imageUrls?: string[];
    text?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): SourceDocumentDto {
  return {
    id: doc.id,
    ledgerId: doc.ledgerId,
    title: doc.title,
    text: options.text ?? doc.text,
    imageUrls: options.imageUrls ?? (doc.imageUrls ?? []),
    status: doc.status,
    type: doc.type,
    anomalyReason: doc.anomalyReason,
    entryDate: doc.entryDate,
    metadata: options.metadata ?? ((doc.metadata ?? {}) as Record<string, unknown>),
    createdAt: toIso(doc.createdAt)!,
    updatedAt: toIso(doc.updatedAt)!,
    deletedAt: toIso(doc.deletedAt),
    hasImages: (doc.imageUrls?.length ?? 0) > 0,
  };
}

type SourceDocumentEntryCategoryInput = {
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

type SourceDocumentLedgerEntryInput = {
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
  category?: SourceDocumentEntryCategoryInput | null;
};

export function mapSourceDocumentEntryCategoryDto(
  category: SourceDocumentEntryCategoryInput
): SourceDocumentEntryCategoryDto {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    name: category.name,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isEditable: category.isEditable,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    deletedAt: category.deletedAt,
  };
}

export function mapSourceDocumentLedgerEntryDto(
  entry: SourceDocumentLedgerEntryInput
): SourceDocumentLedgerEntryDto {
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
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    ...(entry.category !== undefined
      ? {
          category:
            entry.category != null
              ? mapSourceDocumentEntryCategoryDto(entry.category)
              : entry.category,
        }
      : {}),
  };
}

export function mapSourceDocumentListItemDto(
  doc: SourceDocument,
  ledgerEntries: SourceDocumentLedgerEntryDto[] = []
): SourceDocumentListItemDto {
  return {
    ...mapSourceDocumentDto(doc, {
      text: null,
      imageUrls: [],
      metadata: {},
    }),
    ledgerEntries,
  };
}

export function mapSourceDocumentGroupDto(
  sourceDocument: SourceDocumentDto,
  ledgerEntries: SourceDocumentLedgerEntryDto[]
): SourceDocumentGroupDto {
  return {
    sourceDocument,
    ledgerEntries,
  };
}
