import { getLocalStorage } from "./local";
import { isLocalUploadUrl } from "./index";
import { AppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { localStoredFileAdapter } from "@/application/adapters/local";

/**
 * Load image data for AI processing
 * Supports local upload URLs only.
 *
 * @param url - Image URL (local upload URL /api/uploads/...)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  // Must be a local upload URL
  if (!isLocalUploadUrl(url)) {
    throw new ValidationError(
      `Invalid image URL format. Only local upload URLs (/api/uploads/...) are supported: ${url.substring(0, 50)}...`
    );
  }

  const storage = getLocalStorage();
  const key = storage.extractKeyFromUrl(url);

  if (key == null) {
    throw new ValidationError(`Invalid local upload URL: ${url}`);
  }

  try {
    const buffer = await storage.download(key);
    const mimeType = inferImageMimeType(key);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    logger.error({ error, url, key }, "Failed to load image from local storage for AI");
    throw new AppError(
      `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`,
      "IMAGE_LOAD_FAILED"
    );
  }
}

export async function loadStoredFileForAI(ledgerId: string, storedFileId: string): Promise<string> {
  try {
    const read = await localStoredFileAdapter.readAuthorized(ledgerId, storedFileId);
    if (read == null) throw new ValidationError("Stored image is not available for this revision");
    return `data:${read.file.metadata.contentType};base64,${Buffer.from(read.body).toString("base64")}`;
  } catch (error) {
    logger.error({ error, ledgerId, storedFileId }, "Failed to load stored image evidence for AI");
    throw new AppError("Failed to load stored image evidence", "IMAGE_LOAD_FAILED");
  }
}

/**
 * Result of loading an image for AI processing.
 * `success` is the discriminant so downstream filters can narrow correctly.
 */
export interface SuccessfulLoadImageResult {
  url: string;
  dataUrl: string;
  success: true;
}

export interface FailedLoadImageResult {
  url: string;
  error: Error;
  success: false;
}

export type LoadImageResult = SuccessfulLoadImageResult | FailedLoadImageResult;

export function isSuccessfulLoadImageResult(
  result: LoadImageResult
): result is SuccessfulLoadImageResult {
  return result.success;
}

export function isFailedLoadImageResult(result: LoadImageResult): result is FailedLoadImageResult {
  return !result.success;
}

/**
 * Load multiple images for AI processing
 * Uses Promise.allSettled to handle partial failures gracefully
 *
 * @param urls - Array of image URLs (local upload URLs)
 * @returns Array of load results (both successful and failed)
 */
export async function loadImagesForAI(urls: string[]): Promise<LoadImageResult[]> {
  const results = await Promise.allSettled(
    urls.map(async (url): Promise<LoadImageResult> => {
      try {
        const dataUrl = await loadImageForAI(url);
        return { url, dataUrl, success: true };
      } catch (error) {
        return {
          url,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      // This should rarely happen since we catch errors in the mapper
      const sourceUrl = urls[index] ?? "";
      return {
        url: sourceUrl,
        success: false,
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      };
    }
  });
}

export async function loadStoredFilesForAI(
  ledgerId: string,
  storedFileIds: string[]
): Promise<LoadImageResult[]> {
  return Promise.all(
    storedFileIds.map(async (storedFileId) => {
      try {
        return {
          url: storedFileId,
          dataUrl: await loadStoredFileForAI(ledgerId, storedFileId),
          success: true as const,
        };
      } catch (error) {
        return {
          url: storedFileId,
          error: error instanceof Error ? error : new Error(String(error)),
          success: false as const,
        };
      }
    })
  );
}

/**
 * Filter successful image loads and return data URLs
 * Throws if any images failed to load (use this when all images are required)
 *
 * @param urls - Array of image URLs (local upload URLs only)
 * @returns Array of base64 data URLs
 * @throws Error if any image fails to load
 */
export async function loadImagesForAIOrThrow(urls: string[]): Promise<string[]> {
  const results = await loadImagesForAI(urls);
  const failures = results.filter(isFailedLoadImageResult);

  if (failures.length > 0) {
    const errorMessages = failures.map((f) => `${f.url}: ${f.error?.message}`).join("; ");
    throw new AppError(
      `Failed to load ${failures.length} image(s): ${errorMessages}`,
      "IMAGE_BATCH_LOAD_FAILED"
    );
  }

  return results.filter(isSuccessfulLoadImageResult).map((r) => r.dataUrl);
}

/**
 * Infer image MIME type from URL or file extension
 * Used as a fallback when the server returns generic content types like application/octet-stream
 */
export function inferImageMimeType(url: string): string {
  // Remove query parameters
  const [urlWithoutQuery = ""] = url.split("?");
  const ext = urlWithoutQuery.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
  };

  return mimeTypes[ext ?? ""] ?? "image/jpeg";
}
