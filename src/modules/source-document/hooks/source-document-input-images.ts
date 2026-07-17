import { compressImage } from "@/lib/image-utils";
import { toEditableImage } from "./source-document-input-controller.core";
import type { SourceDocumentInputImageLoadResult } from "./source-document-input-controller.types";

export const MAX_FALLBACK_SIZE = 10 * 1024 * 1024;

const SUPPORTED_FALLBACK_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unexpected FileReader result"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function getMimeTypeFromDataUrl(dataUrl: string, fileType: string) {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  return mimeMatch?.[1] ?? (fileType !== "" ? fileType : "image/jpeg");
}

export async function loadSourceDocumentInputFiles(
  files: File[]
): Promise<SourceDocumentInputImageLoadResult[]> {
  const results: SourceDocumentInputImageLoadResult[] = [];

  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      results.push({ kind: "ready", image: toEditableImage(compressed) });
    } catch (error) {
      console.error("Failed to compress image:", error);

      if (!SUPPORTED_FALLBACK_TYPES.has(file.type)) {
        results.push({ kind: "unsupported", fileName: file.name });
        continue;
      }

      if (file.size > MAX_FALLBACK_SIZE) {
        results.push({ kind: "too-large", fileName: file.name });
        continue;
      }

      const base64 = await readFileAsDataUrl(file);
      results.push({
        kind: "ready",
        image: toEditableImage({
          data: base64,
          mimeType: getMimeTypeFromDataUrl(base64, file.type),
        }),
      });
    }
  }

  return results;
}
