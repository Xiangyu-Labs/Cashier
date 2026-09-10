import type { SourceDocumentInputInitialData } from "@/modules/source-document/hooks/source-document-input-controller.types";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";

export interface RetrySeedSourceDocument {
  id: string;
  version: number;
  text?: string | null;
  files?: SourceDocumentStoredFileDto[];
  documentDate?: string | null;
  hasImages?: boolean;
}

export interface RetrySeedFullData {
  text: string | null;
  files: SourceDocumentStoredFileDto[];
  documentDate: string | null;
}

export function buildSourceDocumentRetrySeed(
  sourceDocument: RetrySeedSourceDocument,
  fullData?: RetrySeedFullData
): SourceDocumentInputInitialData {
  const files = fullData?.files ?? sourceDocument.files ?? [];
  const text = fullData?.text ?? sourceDocument.text ?? undefined;
  const documentDate = fullData !== undefined ? fullData.documentDate : sourceDocument.documentDate;

  return {
    images: files.map((file) => ({
      data: storedFileReadUrl(file.id),
      mimeType: file.contentType,
      storedFileId: file.id,
    })),
    ...(text != null ? { text } : {}),
    ...(documentDate != null ? { entryDate: documentDate } : {}),
  };
}
