import type { SourceDocument } from "@/persistence";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
import type {
  SourceDocumentDto,
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

export function mapSourceDocumentListItemDto(
  doc: SourceDocument,
  ledgerEntries: LedgerEntryEmbeddedViewDto[] = []
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
  ledgerEntries: LedgerEntryEmbeddedViewDto[]
): SourceDocumentGroupDto {
  return {
    sourceDocument,
    ledgerEntries,
  };
}
