import type { StorageProvider } from "./index";

/**
 * In-memory storage provider for testing
 *
 * Stores files in memory, useful for unit tests without external dependencies
 */
export class MemoryStorageProvider implements StorageProvider {
  private storage = new Map<string, { data: Buffer; contentType: string }>();

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    this.storage.set(key, { data, contentType });
    return this.getPublicUrl(key);
  }

  async download(key: string): Promise<Buffer> {
    const file = this.storage.get(key);
    if (!file) {
      throw new Error(`File not found: ${key}`);
    }
    return Buffer.from(file.data);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  getPublicUrl(key: string): string {
    return `memory://${key}`;
  }

  extractKeyFromUrl(url: string): string | null {
    if (!url.startsWith("memory://")) {
      return null;
    }
    return url.slice("memory://".length);
  }

  /**
   * Clear all stored files (useful for test cleanup)
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get number of stored files
   */
  size(): number {
    return this.storage.size;
  }
}

/**
 * Singleton instance for tests
 */
let memoryInstance: MemoryStorageProvider | null = null;

export function getMemoryStorage(): MemoryStorageProvider {
  if (!memoryInstance) {
    memoryInstance = new MemoryStorageProvider();
  }
  return memoryInstance;
}
