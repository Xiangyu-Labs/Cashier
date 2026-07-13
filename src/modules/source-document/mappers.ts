import type { SourceDocument } from "@/persistence";
export {
  mapSourceDocumentEntryCategoryDto,
  mapSourceDocumentDto,
  mapSourceDocumentLedgerEntryDto,
  mapSourceDocumentListItemDto,
  mapSourceDocumentGroupDto,
} from "./application/mappers";
import { mapSourceDocumentDto, mapSourceDocumentLedgerEntryDto } from "./application/mappers";
import type {
  SourceDocumentDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightDto,
} from "./contracts";

export interface SerializeSourceDocumentOptions {
  stripMetadataFields?: string[];
  imageUrlsOverride?: string[];
  includeHasImages?: boolean;
  ledgerEntries?: SourceDocumentLedgerEntryDto[];
}

type LegacySourceDocumentProjection = Pick<
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
>;

export function serializeSourceDocument(
  doc: LegacySourceDocumentProjection,
  options: SerializeSourceDocumentOptions = {}
): SourceDocumentDto {
  const {
    stripMetadataFields = [],
    imageUrlsOverride,
    includeHasImages = false,
    ledgerEntries: entriesOverride,
  } = options;

  const rawMetadata = doc.metadata ?? {};
  const metadata =
    stripMetadataFields.length > 0
      ? Object.fromEntries(
          Object.entries(rawMetadata).filter(([key]) => !stripMetadataFields.includes(key))
        )
      : rawMetadata;

  const imageUrls = imageUrlsOverride !== undefined ? imageUrlsOverride : (doc.imageUrls ?? []);
  const ledgerEntries =
    entriesOverride?.map((entry) => mapSourceDocumentLedgerEntryDto(entry)) ?? undefined;

  return {
    ...mapSourceDocumentDto(doc, {
      imageUrls,
      metadata: metadata as Record<string, unknown>,
    }),
    ...(ledgerEntries !== undefined ? { ledgerEntries } : {}),
    ...(includeHasImages ? { hasImages: (doc.imageUrls?.length ?? 0) > 0 } : {}),
  };
}

export function serializeSourceDocumentLight(doc: LegacySourceDocumentProjection): SourceDocumentLightDto {
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
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt?.toISOString() ?? null,
    hasImages: (doc.imageUrls?.length ?? 0) > 0,
  };
}
