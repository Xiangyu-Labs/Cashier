import type { SourceDocument } from "@/persistence";
export {
  mapSourceDocumentEntryCategoryDto,
  mapSourceDocumentDto,
  mapSourceDocumentLedgerEntryDto,
  mapSourceDocumentListItemDto,
  mapSourceDocumentGroupDto,
} from "./application/mappers";
import {
  mapSourceDocumentDto,
  mapSourceDocumentLedgerEntryDto,
} from "./application/mappers";
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

export function serializeSourceDocument(
  doc: SourceDocument,
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

export function serializeSourceDocumentLight(doc: SourceDocument): SourceDocumentLightDto {
  const { imageUrls: _imageUrls, ...lightDoc } = mapSourceDocumentDto(doc);
  return lightDoc;
}
