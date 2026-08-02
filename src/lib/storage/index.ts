export interface ObjectStore {
  upload(key: string, data: Buffer, contentType: string): Promise<unknown>;
  download(key: string): Promise<Buffer>;
  stream?(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<{ success: boolean; key?: string; error?: Error }>;
  presignUpload?(
    key: string,
    contentType: string,
    sha256: string,
    expiresInSeconds: number
  ): Promise<{ url: string; requiredHeaders: Readonly<Record<string, string>> }>;
  head?(key: string): Promise<{
    byteSize: number;
    contentType: string;
    metadata: Readonly<Record<string, string>>;
  }>;
  copy?(sourceKey: string, destinationKey: string): Promise<void>;
}

export type StorageProvider = ObjectStore;

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
