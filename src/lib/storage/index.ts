/**
 * Storage Provider Interface
 *
 * Abstracts file storage operations to support multiple backends:
 - R2 (Cloudflare) - production
 - Memory - testing
 * Local filesystem - future option
 */

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param key - Unique key/path for the file
   * @param data - File data as Buffer
   * @param contentType - MIME type
   * @returns Public URL of the uploaded file
   */
  upload(key: string, data: Buffer, contentType: string): Promise<string>;

  /**
   * Download a file from storage
   * @param key - Key/path of the file
   * @returns File data as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param key - Key/path of the file
   */
  delete(key: string): Promise<void>;

  /**
   * Get the public URL for a file
   * @param key - Key/path of the file
   * @returns Full public URL
   */
  getPublicUrl(key: string): string;

  /**
   * Extract key from a public URL
   * @param url - Public URL
   * @returns Key or null if not a valid URL for this storage
   */
  extractKeyFromUrl(url: string): string | null;
}

/**
 * Check if a URL is a base64 data URL
 */
export function isBase64Url(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Check if a URL is an HTTP(S) URL
 */
export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Convert base64 data URL to Buffer
 */
export function base64ToBuffer(base64Url: string): { buffer: Buffer; mimeType: string } {
  const matches = base64Url.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 data URL');
  }
  const [, mimeType, base64Data] = matches;
  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
}

/**
 * Convert Buffer to base64 data URL
 */
export function bufferToBase64(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}
