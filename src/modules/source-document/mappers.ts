import type { LedgerEntry, SourceDocument } from "@/persistence";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
export {
  mapSourceDocumentDto,
  mapSourceDocumentListItemDto,
  mapSourceDocumentGroupDto,
} from "./application/mappers";
import { mapSourceDocumentDto } from "./application/mappers";
import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
import type { SourceDocumentDto, SourceDocumentLightDto } from "./contracts";

export interface SerializeSourceDocumentOptions {
  stripMetadataFields?: string[];
  imageUrlsOverride?: string[];
  includeHasImages?: boolean;
  ledgerEntries?: LedgerEntryDto[];
}

export function serializeSourceDocument(
  doc: SourceDocument & { ledgerEntries?: LedgerEntry[] },
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
  const ledgerEntries = entriesOverride ?? doc.ledgerEntries?.map((entry) => mapLedgerEntryDto(entry));

  return {
    ...mapSourceDocumentDto(doc, {
      imageUrls,
      metadata: metadata as Record<string, unknown>,
    }),
    ledgerEntries,
    ...(includeHasImages ? { hasImages: (doc.imageUrls?.length ?? 0) > 0 } : {}),
  };
}

export function serializeSourceDocumentLight(doc: SourceDocument): SourceDocumentLightDto {
  return mapSourceDocumentDto(doc);
}
