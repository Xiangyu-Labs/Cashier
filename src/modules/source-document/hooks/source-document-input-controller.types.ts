import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";

export type SourceDocumentInputInitialData = NonNullable<SourceDocumentInputProps["initialData"]>;

export interface EditableInputImage extends SourceDocumentModalImage {
  originalData: string;
  originalMimeType: string;
  isEdited: boolean;
}

export interface SourceDocumentSubmitPayload {
  entryDate: string;
  text?: string;
  images?: SourceDocumentModalImage[];
  originalImages?: SourceDocumentModalImage[];
  storedFileIds?: string[];
}

export interface SourceDocumentInputControllerMessages {
  uploadSuccess: string;
  uploadError: string;
  retrySuccess: string;
  retryError: string;
  imageTooLarge: (fileName: string) => string;
}

export type SourceDocumentInputImageLoadResult =
  | { kind: "ready"; image: EditableInputImage }
  | { kind: "too-large"; fileName: string };
