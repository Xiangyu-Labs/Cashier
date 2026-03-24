import type { SourceDocumentInputInitialData } from "@/modules/source-document/hooks/source-document-input-controller.types";

export interface RetrySeedSourceDocument {
  id: string;
  text?: string | null;
  imageUrls?: string[];
  entryDate?: string | null;
  hasImages?: boolean;
}

export interface RetrySeedFullData {
  text: string | null;
  imageUrls: string[];
}

export function buildSourceDocumentRetrySeed(
  sourceDocument: RetrySeedSourceDocument,
  fullData?: RetrySeedFullData
): SourceDocumentInputInitialData {
  const imageUrls = fullData?.imageUrls ?? sourceDocument.imageUrls ?? [];
  const text = fullData?.text ?? sourceDocument.text ?? undefined;

  return {
    images: imageUrls.map((url) => ({
      data: url,
      mimeType: "image/jpeg",
    })),
    ...(text != null ? { text } : {}),
    ...(sourceDocument.entryDate != null ? { entryDate: sourceDocument.entryDate } : {}),
  };
}
