import { getR2Storage, isR2Enabled } from "./r2";
import { isBase64Url, isHttpUrl, base64ToBuffer } from "./index";
import { logger } from "../logger";

// Maximum response size: 10MB
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
// Request timeout: 5 seconds
const REQUEST_TIMEOUT_MS = 5000;

// Allowed hostname patterns for external URLs
const ALLOWED_HOSTNAME_PATTERNS = [
  /\.r2\.cloudflarestorage\.com$/,
  /\.r2\.dev$/,
];

/**
 * Check if a hostname is allowed for external fetching
 */
function isAllowedHostname(hostname: string): boolean {
  // Check against allowed patterns
  if (ALLOWED_HOSTNAME_PATTERNS.some(pattern => pattern.test(hostname))) {
    return true;
  }

  // Check for custom R2 public URL
  if (process.env.R2_PUBLIC_URL) {
    try {
      const allowedHostname = new URL(process.env.R2_PUBLIC_URL).hostname;
      if (hostname === allowedHostname || hostname.endsWith(`.${allowedHostname}`)) {
        return true;
      }
    } catch {
      // Invalid R2_PUBLIC_URL, ignore
    }
  }

  return false;
}

/**
 * Check if a hostname is an internal/private IP address
 */
function isInternalIP(hostname: string): boolean {
  // Check localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    return true;
  }

  // Check IPv4 private ranges
  const privateRanges = [
    /^10\./,                              // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,      // 172.16.0.0/12
    /^192\.168\./,                        // 192.168.0.0/16
    /^169\.254\./,                        // Link-local 169.254.0.0/16
    /^127\./,                             // Loopback 127.0.0.0/8
    /^0\./,                               // Current network 0.0.0.0/8
  ];

  if (privateRanges.some(range => range.test(hostname))) {
    return true;
  }

  // Check IPv6 loopback/link-local
  if (
    hostname.startsWith("fe80:") ||      // Link-local
    hostname.startsWith("fc00:") ||      // Unique local
    hostname.startsWith("fd00:") ||      // Unique local
    hostname === "::1"                   // Loopback
  ) {
    return true;
  }

  return false;
}

/**
 * Safely fetch a URL with SSRF protection
 */
async function safeFetch(url: string): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  // Block non-HTTP(S) protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  // Block internal IP addresses (SSRF protection)
  if (isInternalIP(parsed.hostname)) {
    throw new Error("Access to internal addresses is not allowed");
  }

  // Only allow whitelisted hostnames
  if (!isAllowedHostname(parsed.hostname)) {
    throw new Error("Hostname not in allowlist");
  }

  // Set timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual", // Don't follow redirects to prevent redirect-based SSRF
      headers: {
        "User-Agent": "Cashier-App/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    // Check response size
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large: ${contentLength} bytes`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

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
          // Determine mime type from key
          const ext = key.split(".").pop()?.toLowerCase();
          const mimeType = ext === "png"
            ? "image/png"
            : ext === "webp"
            ? "image/webp"
            : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
          const base64 = buffer.toString("base64");
          return `data:${mimeType};base64,${base64}`;
        }
      }

      // Not an R2 URL or R2 not enabled, fetch directly with SSRF protection
      const response = await safeFetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Double-check size after download
      if (buffer.length > MAX_RESPONSE_SIZE) {
        throw new Error(`Response too large: ${buffer.length} bytes`);
      }

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
