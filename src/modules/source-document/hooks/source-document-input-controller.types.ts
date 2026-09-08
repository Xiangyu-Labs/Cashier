import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";

export type SourceDocumentInputInitialData = NonNullable<SourceDocumentInputProps["initialData"]>;

export type EditableInputImage = SourceDocumentModalImage & {
  file?: File;
  objectUrl?: boolean;
};

export interface SourceDocumentUploadImage {
  file: File;
  mimeType: string;
}

export interface SourceDocumentSubmitPayload {
  entryDate: string;
  timezone?: string;
  text?: string;
  images?: SourceDocumentUploadImage[];
  storedFileIds?: string[];
}

export interface SourceDocumentInputControllerMessages {
  retrySuccess: string;
  retryError: string;
  imageTooLarge: (fileName: string) => string;
  imageUnsupported: (fileName: string) => string;
  imageReadError: string;
  imageUploadError: string;
  networkError: string;
  validationError: string;
  createError: string;
  tooManyImages: string;
}

export type SourceDocumentInputImageLoadResult =
  | { kind: "ready"; image: EditableInputImage }
  | { kind: "too-large"; fileName: string }
  | { kind: "unsupported"; fileName: string };
