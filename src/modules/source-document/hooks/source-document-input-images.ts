import { compressImage } from "@/lib/image-utils";
import { toEditableImage } from "./source-document-input-controller.core";
import type { SourceDocumentInputImageLoadResult } from "./source-document-input-controller.types";

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
      results.push({ kind: "unsupported", fileName: file.name });
    }
  }

  return results;
}
