import { getR2Storage, isR2Enabled } from "./r2";
import { isBase64Url, isHttpUrl, base64ToBuffer } from "./index";
import { logger } from "@/lib/logger";

/**
 * Load image data for AI processing
 * Supports both base64 data URLs and R2 HTTP URLs
 *
 * @param url - Image URL (base64 data URL or R2 HTTP URL)
 * @returns Base64 data URL for AI API
 */
export async function loadImageForAI(url: string): Promise<string> {
  // If it's already a base64 data URL, return as-is
  if (isBase64Url(url)) {
    return url;
  }

  // If it's an HTTP URL (R2), download and convert to base64
  if (isHttpUrl(url)) {
    try {
      // Check if it's an R2 URL
      if (isR2Enabled()) {
        const storage = getR2Storage();
        const key = storage.extractKeyFromUrl(url);

        if (key) {
          // Download from R2
          const buffer = await storage.download(key);
          // Determine mime type from key or default to jpeg
          const ext = key.split(".").pop()?.toLowerCase();
          const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const base64 = buffer.toString("base64");
          return `data:${mimeType};base64,${base64}`;
        }
      }

      // Not an R2 URL or R2 not enabled, fetch directly
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const base64 = buffer.toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      logger.error({ error, url }, "Failed to load image for AI");
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(`Unsupported image URL format: ${url.substring(0, 50)}...`);
}

/**
 * Load multiple images for AI processing
 *
 * @param urls - Array of image URLs
 * @returns Array of base64 data URLs
 */
export async function loadImagesForAI(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((url) => loadImageForAI(url)));
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
