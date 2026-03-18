import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import type { CategoryInfo } from "@/features/ai/types";
import { getLocalStorage } from "@/lib/storage/local";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";
import { processImage, isSupportedImageFormat } from "@/lib/storage/image-processing";
import crypto from "crypto";
export { getSourceDocumentTaskContext } from "./create-task-context";

// Maximum file size: 10MB (before compression)
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Maximum file size after compression: 5MB
const MAX_COMPRESSED_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Process images: upload to R2 if enabled, otherwise normalize to base64
 */
export async function processImages(
  images: { data: string; mimeType: string }[] | undefined,
  ledgerId: string,
  sourceDocumentId: string
): Promise<string[]> {
  if (images == null || images.length === 0) {
    return [];
  }

  const storage = getLocalStorage();
  const imageUrls: string[] = [];

  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
  };

  for (const img of images) {
    // Skip if already a URL (http://, https://, or /api/uploads/)
    if (
      img.data.startsWith("http://") ||
      img.data.startsWith("https://") ||
      img.data.startsWith("/api/uploads/")
    ) {
      imageUrls.push(img.data);
      continue;
    }

    // Parse base64 data - use [^;]+ to match MIME types with special chars like image/svg+xml
    const base64Data = img.data.startsWith("data:")
      ? img.data.replace(/^data:image\/[^;]+;base64,/, "")
      : img.data;
    const buffer = Buffer.from(base64Data, "base64");

    // Validate file size (before compression)
    if (buffer.length > MAX_FILE_SIZE) {
      throw new ValidationError(
        `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Skip compression for unsupported formats or SVGs
    let processedBuffer = buffer;
    let outputMimeType = img.mimeType;

    if (isSupportedImageFormat(img.mimeType) && !img.mimeType.includes("svg")) {
      // Process and compress image
      const processed = await processImage(buffer, img.mimeType, {
        maxDimension: 2048,
        quality: 85,
        format: "auto", // Will convert to WebP for better compression (except PNGs)
        stripMetadata: true,
      });
      processedBuffer = Buffer.from(processed.buffer);
      outputMimeType = processed.mimeType;

      logger.debug(
        {
          originalSize: buffer.length,
          processedSize: processedBuffer.length,
          originalMime: img.mimeType,
          outputMime: outputMimeType,
        },
        "Image compressed"
      );
    }

    // Validate compressed size
    if (processedBuffer.length > MAX_COMPRESSED_FILE_SIZE) {
      throw new ValidationError(
        `Compressed file still too large: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_COMPRESSED_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Generate unique key with proper extension based on output mimeType
    const ext = mimeToExt[outputMimeType] ?? "jpg";
    const key = `${ledgerId}/${sourceDocumentId}/${crypto.randomUUID()}.${ext}`;

    // Upload to local storage
    const url = await storage.upload(key, processedBuffer, outputMimeType);
    imageUrls.push(url);

    logger.debug(
      {
        key,
        originalSize: buffer.length,
        processedSize: processedBuffer.length,
        originalMime: img.mimeType,
        outputMime: outputMimeType,
      },
      "Image uploaded to local storage"
    );
  }

  return imageUrls;
}

interface PrepareSourceDocumentTaskInput {
  ledgerId: string;
  sourceDocumentId: string;
  text?: string;
  imageUrls: string[];
  categories: CategoryInfo[];
  settings: {
    aiLanguage: string;
    preferredCurrencies?: string[];
    settings: {
      aiCustomPrompt?: string;
    };
  };
}

/**
 * Submit a parse task for an already-created source document.
 */
export async function prepareSourceDocumentTask({
  ledgerId,
  sourceDocumentId,
  text,
  imageUrls,
  categories,
  settings,
}: PrepareSourceDocumentTaskInput): Promise<void> {
  await flowEngine.submit(
    TASK_TYPE_PARSE_SOURCE_DOCUMENT,
    {
      ledgerId,
      sourceDocumentId,
      text,
      imageUrls,
      aiLanguage: settings.aiLanguage,
      preferredCurrencies: settings.preferredCurrencies,
      categories,
      settings: settings.settings,
    },
    {
      title: "Parse source document",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: sourceDocumentId,
    }
  );
}
