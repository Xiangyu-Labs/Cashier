const LEGACY_CLIENT_CACHE_DATABASE = "cashier-cache";

let deletionPromise: Promise<void> | null = null;

export function deleteLegacyClientCache(): Promise<void> {
  if (deletionPromise != null) return deletionPromise;
  if (globalThis.indexedDB == null) return Promise.resolve();

  deletionPromise = new Promise<void>((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(LEGACY_CLIENT_CACHE_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to delete the legacy client cache"));
  });

  return deletionPromise;
}
