export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<{ success: boolean; key?: string; error?: Error }>;
}

export function assertSafeStorageKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("Invalid storage key");
  }
}
