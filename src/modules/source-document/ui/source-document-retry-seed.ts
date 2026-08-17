import type { SourceDocumentInputInitialData } from "@/modules/source-document/hooks/source-document-input-controller.types";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";
import { storedFileReadUrl } from "../stored-file-read";

export interface RetrySeedSourceDocument {
  id: string;
  text?: string | null;
  files?: SourceDocumentStoredFileDto[];
  entryDate?: string | null;
  hasImages?: boolean;
}

export interface RetrySeedFullData {
  text: string | null;
  files: SourceDocumentStoredFileDto[];
}

export function buildSourceDocumentRetrySeed(
  sourceDocument: RetrySeedSourceDocument,
  fullData?: RetrySeedFullData
): SourceDocumentInputInitialData {
  const files = fullData?.files ?? sourceDocument.files ?? [];
  const text = fullData?.text ?? sourceDocument.text ?? undefined;

  return {
    images: files.map((file) => ({
      data: storedFileReadUrl(file.id),
      mimeType: file.contentType,
      storedFileId: file.id,
    })),
    ...(text != null ? { text } : {}),
    ...(sourceDocument.entryDate != null ? { entryDate: sourceDocument.entryDate } : {}),
  };
}
