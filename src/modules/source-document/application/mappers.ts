import type { SourceDocument, LedgerEntry } from "@/persistence";
import type {
  SourceDocumentDto,
  SourceDocumentGroupDto,
  SourceDocumentListItemDto,
} from "../contracts";
import { mapLedgerEntryDto } from "@/modules/ledger/application/mappers";

function toIso(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

export function mapSourceDocumentDto(
  doc: SourceDocument & { ledgerEntries?: Array<LedgerEntry & { category?: never }> },
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
    ledgerEntries: doc.ledgerEntries?.map((entry) => mapLedgerEntryDto(entry)),
    hasImages: (doc.imageUrls?.length ?? 0) > 0,
  };
}

export function mapSourceDocumentListItemDto(
  doc: SourceDocument,
  ledgerEntries: ReturnType<typeof mapLedgerEntryDto>[] = []
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
  ledgerEntries: ReturnType<typeof mapLedgerEntryDto>[]
): SourceDocumentGroupDto {
  return {
    sourceDocument,
    ledgerEntries,
  };
}
