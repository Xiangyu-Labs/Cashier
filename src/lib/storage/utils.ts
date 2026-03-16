import { getLocalStorage } from "./local";
import { isBase64Url, isHttpUrl, isLocalUploadUrl } from "./index";
import { logger } from "@/lib/logger";

/**
 * Load image data for AI processing
 * Supports base64 data URLs, local upload URLs, and HTTP URLs
 *
 * @param url - Image URL (base64 data URL, local upload URL, or HTTP URL)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  // If it's already a base64 data URL, return as-is
  if (isBase64Url(url)) {
    return url;
  }

  // If it's a local upload URL, read from local storage
  if (isLocalUploadUrl(url)) {
    const storage = getLocalStorage();
    const key = storage.extractKeyFromUrl(url);

    if (!key) {
      throw new Error(`Invalid local upload URL: ${url}`);
    }

    try {
      const buffer = await storage.download(key);
      const mimeType = inferImageMimeType(key);
      const base64 = buffer.toString("base64");
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      logger.error({ error, url, key }, "Failed to load image from local storage for AI");
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // For any other HTTP URL, fetch directly
  if (isHttpUrl(url)) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Cashier-App/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || inferImageMimeType(url);
      const base64 = buffer.toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      logger.error({ error, url }, "Failed to fetch external image for AI");
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(`Unsupported image URL format: ${url.substring(0, 50)}...`);
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
 * @param urls - Array of image URLs
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
      return {
        url: urls[index],
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
 * @param urls - Array of image URLs
 * @returns Array of base64 data URLs
 * @throws Error if any image fails to load
 */
export async function loadImagesForAIOrThrow(urls: string[]): Promise<string[]> {
  const results = await loadImagesForAI(urls);
  const failures = results.filter(r => !r.success);

  if (failures.length > 0) {
    const errorMessages = failures.map(f => `${f.url}: ${f.error?.message}`).join("; ");
    throw new Error(`Failed to load ${failures.length} image(s): ${errorMessages}`);
  }

  return results.map(r => r.dataUrl!);
}

/**
 * Check if an image URL needs to be loaded (converted to base64)
 *
 * @param url - Image URL
 * @returns true if the URL needs to be loaded (is HTTP URL)
 */
export function needsLoading(url: string): boolean {
  return isHttpUrl(url) && !isBase64Url(url);
}

/**
 * Infer image MIME type from URL or file extension
 * Used as a fallback when the server returns generic content types like application/octet-stream
 */
export function inferImageMimeType(url: string): string {
  // Remove query parameters
  const urlWithoutQuery = url.split('?')[0];
  const ext = urlWithoutQuery.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'avif': 'image/avif',
  };

  return mimeTypes[ext || ''] || 'image/jpeg';
}
