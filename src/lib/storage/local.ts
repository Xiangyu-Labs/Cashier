import { promises as fs } from 'fs';
import path from 'path';
import type { StorageProvider } from './index';
import { logger } from '@/lib/logger';

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  success: boolean;
  key: string;
  error?: Error;
}

/**
 * Local filesystem storage provider
 *
 * Stores files on the local filesystem, useful for development
 * or self-hosted deployments without external storage services
 */
export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || './data/uploads';
  }

  /**
   * Validate key to prevent path traversal attacks
   */
  private validateKey(key: string): void {
    // Reject keys with path traversal sequences
    if (key.includes('..')) {
      throw new Error(`Invalid key: path traversal detected in "${key}"`);
    }

    // Reject keys with backslashes (Windows-style paths)
    if (key.includes('\\')) {
      throw new Error(`Invalid key: backslash detected in "${key}"`);
    }

    // Reject absolute paths
    if (key.startsWith('/')) {
      throw new Error(`Invalid key: absolute path detected in "${key}"`);
    }
  }

  /**
   * Get the full filesystem path for a key
   */
  private getFullPath(key: string): string {
    this.validateKey(key);
    return path.join(this.basePath, key);
  }

  async upload(key: string, data: Buffer, contentType: string, cacheControl?: string): Promise<string> {
    try {
      const fullPath = this.getFullPath(key);

      // Ensure the directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write the file
      await fs.writeFile(fullPath, data);

      logger.debug({ key, size: data.length, contentType, cacheControl }, 'File uploaded to local storage');
      return this.getPublicUrl(key);
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to local storage');
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const fullPath = this.getFullPath(key);
      const data = await fs.readFile(fullPath);
      return data;
    } catch (error) {
      logger.error({ error, key }, 'Failed to download file from local storage');
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${key}`);
      }
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<DeleteResult> {
    try {
      const fullPath = this.getFullPath(key);
      await fs.unlink(fullPath);

      logger.debug({ key }, 'File deleted from local storage');
      return { success: true, key };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: err, key }, 'Failed to delete file from local storage');

      // If file doesn't exist, consider it a success (idempotent delete)
      if ('code' in err && err.code === 'ENOENT') {
        return { success: true, key };
      }

      return { success: false, key, error: err };
    }
  }

  getPublicUrl(key: string): string {
    // Remove leading slash if present
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return `/api/uploads/${cleanKey}`;
  }

  extractKeyFromUrl(url: string): string | null {
    // Remove query parameters and hash fragments for security
    const urlWithoutQuery = url.split('?')[0].split('#')[0];

    // Check if this is a local uploads URL
    const prefix = '/api/uploads/';
    if (!urlWithoutQuery.startsWith(prefix)) {
      return null;
    }

    let key = urlWithoutQuery.slice(prefix.length);

    // Prevent path traversal attacks
    if (key.includes('..') || key.includes('\\')) {
      logger.warn({ key, url }, 'Potential path traversal attempt detected in local storage key');
      return null;
    }

    // Reject absolute paths
    if (key.startsWith('/')) {
      logger.warn({ key, url }, 'Absolute path detected in local storage key');
      return null;
    }

    return key;
  }
}

/**
 * Singleton instance of local storage provider
 */
let localInstance: LocalStorageProvider | null = null;

export function getLocalStorage(): LocalStorageProvider {
  if (!localInstance) {
    localInstance = new LocalStorageProvider();
  }
  return localInstance;
}
