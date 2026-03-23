import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type {
  EditableInputImage,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";

export function toEditableImage(image: SourceDocumentModalImage): EditableInputImage {
  return {
    ...image,
    originalData: image.data,
    originalMimeType: image.mimeType,
    isEdited: false,
  };
}

export function toEditableImages(images?: SourceDocumentModalImage[]) {
  return (images ?? []).map(toEditableImage);
}

export function toModalImages(images: EditableInputImage[]): SourceDocumentModalImage[] {
  return images.map(({ data, mimeType }) => ({ data, mimeType }));
}

export function mergeModalImagesIntoEditableImages(
  currentImages: EditableInputImage[],
  updatedImages: SourceDocumentModalImage[]
) {
  return currentImages.map((image, index) => {
    const updatedImage = updatedImages[index];
    if (updatedImage == null) return image;

    return {
      ...image,
      data: updatedImage.data,
      mimeType: updatedImage.mimeType,
      isEdited:
        updatedImage.data !== image.originalData ||
        updatedImage.mimeType !== image.originalMimeType,
    };
  });
}

export function resolveInitialEntryDate(entryDate?: string): Date {
  if (entryDate != null) {
    const parsed = parseDateString(entryDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

export function buildSubmitPayload(
  text: string,
  images: EditableInputImage[],
  entryDate: Date
): SourceDocumentSubmitPayload {
  const nextImages = images.map(({ data, mimeType }) => ({ data, mimeType }));
  const originalImages = images.map(({ originalData, originalMimeType }) => ({
    data: originalData,
    mimeType: originalMimeType,
  }));

  return {
    entryDate: formatDateTimeForApi(entryDate),
    ...(text !== "" ? { text } : {}),
    ...(nextImages.length > 0 ? { images: nextImages } : {}),
    ...(images.some((image) => image.isEdited) ? { originalImages } : {}),
  };
}
