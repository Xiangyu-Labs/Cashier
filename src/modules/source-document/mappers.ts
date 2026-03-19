import type { SourceDocument } from "@/persistence";
import type { LedgerEntryEmbeddedViewDto } from "@/modules/ledger/contracts";
export {
  mapSourceDocumentDto,
  mapSourceDocumentListItemDto,
  mapSourceDocumentGroupDto,
} from "./application/mappers";
import { mapSourceDocumentDto } from "./application/mappers";
import type { SourceDocumentDto, SourceDocumentLightDto } from "./contracts";

export interface SerializeSourceDocumentOptions {
  stripMetadataFields?: string[];
  imageUrlsOverride?: string[];
  includeHasImages?: boolean;
  ledgerEntries?: LedgerEntryEmbeddedViewDto[];
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

  return {
    ...mapSourceDocumentDto(doc, {
      imageUrls,
      metadata: metadata as Record<string, unknown>,
    }),
    ledgerEntries: entriesOverride,
    ...(includeHasImages ? { hasImages: (doc.imageUrls?.length ?? 0) > 0 } : {}),
  };
}

export function serializeSourceDocumentLight(doc: SourceDocument): SourceDocumentLightDto {
  const { imageUrls: _imageUrls, ...lightDoc } = mapSourceDocumentDto(doc);
  return lightDoc;
}
