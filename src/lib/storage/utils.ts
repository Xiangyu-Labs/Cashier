import { getLocalStorage } from "./local";
import { isLocalUploadUrl } from "./index";
import { logger } from "@/lib/logger";

/**
 * Check if a URL is a base64 data URL
 */
function isBase64DataUrl(url: string): boolean {
  return url.startsWith("data:");
}

/**
 * Load image data for AI processing
 * Supports local upload URLs and base64 data URLs
 *
 * @param url - Image URL (local upload URL /api/uploads/... or base64 data URL)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  // If it's already a base64 data URL, return as-is
  if (isBase64DataUrl(url)) {
    return url;
  }

  // Must be a local upload URL
  if (!isLocalUploadUrl(url)) {
    throw new Error(
      `Invalid image URL format. Only local upload URLs (/api/uploads/...) or base64 data URLs are supported: ${url.substring(0, 50)}...`
    );
  }

  const storage = getLocalStorage();
  const key = storage.extractKeyFromUrl(url);

  if (key == null) {
    throw new Error(`Invalid local upload URL: ${url}`);
  }

  try {
    const buffer = await storage.download(key);
    const mimeType = inferImageMimeType(key);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    logger.error({ error, url, key }, "Failed to load image from local storage for AI");
    throw new Error(
      `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Result of loading an image for AI processing
 */
export interface LoadImageResult {
  url: string;
  dataUrl?: string;
  error?: Error;
  success: boolean;
}

/**
 * Load multiple images for AI processing
 * Uses Promise.allSettled to handle partial failures gracefully
 *
 * @param urls - Array of image URLs (local upload URLs only)
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
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    const errorMessages = failures.map((f) => `${f.url}: ${f.error?.message}`).join("; ");
    throw new Error(`Failed to load ${failures.length} image(s): ${errorMessages}`);
  }

  return results.map((r) => r.dataUrl!);
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
