/**
 * Storage Provider Interface
 *
 * Local filesystem storage only
 */

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param key - Unique key/path for the file
   * @param data - File data as Buffer
   * @param contentType - MIME type
   * @param cacheControl - Cache-Control header (optional)
   * @returns Public URL of the uploaded file
   */
  upload(key: string, data: Buffer, contentType: string, cacheControl?: string): Promise<string>;

  /**
   * Download a file from storage
   * @param key - Key/path of the file
   * @returns File data as Buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param key - Key/path of the file
   * @returns Delete result with success status
   */
  delete(key: string): Promise<{ success: boolean; key: string; error?: Error }>;

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
 * Check if a URL is a local upload URL (/api/uploads/)
 */
export function isLocalUploadUrl(url: string): boolean {
  return url.startsWith("/api/uploads/");
}
