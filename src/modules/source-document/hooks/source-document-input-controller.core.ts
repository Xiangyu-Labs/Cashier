import { formatDateTimeForApi, getDateInTimezone, parseDateString } from "@/lib/date-utils";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type {
  EditableInputImage,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";

export function toEditableImage(image: SourceDocumentModalImage): EditableInputImage {
  return { ...image };
}

export function toEditableImages(images?: SourceDocumentModalImage[]) {
  return (images ?? []).map(toEditableImage);
}

export function toModalImages(images: EditableInputImage[]): SourceDocumentModalImage[] {
  return images.map(({ data, mimeType, storedFileId }) => ({
    data,
    mimeType,
    ...(storedFileId == null ? {} : { storedFileId }),
  }));
}

export function resolveInitialEntryDate(entryDate?: string, timeZone?: string): Date {
  if (entryDate != null) {
    const parsed = parseDateString(entryDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const zonedDate = getDateInTimezone(timeZone);
  return zonedDate != null ? parseDateString(zonedDate) : new Date();
}

export function buildSubmitPayload(
  text: string,
  images: EditableInputImage[],
  entryDate: Date,
  timeZone?: string
): SourceDocumentSubmitPayload {
  const newImages = images
    .filter((image) => image.storedFileId == null)
    .map(({ data, mimeType }) => ({ data, mimeType }));
  const storedFileIds = images.flatMap((image) =>
    image.storedFileId == null ? [] : [image.storedFileId]
  );
  return {
    entryDate: formatDateTimeForApi(entryDate),
    ...(timeZone != null
      ? { timezone: timeZone }
      : typeof Intl !== "undefined"
        ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : {}),
    ...(text !== "" ? { text } : {}),
    ...(newImages.length > 0 ? { images: newImages } : {}),
    ...(storedFileIds.length > 0 ? { storedFileIds } : {}),
  };
}
