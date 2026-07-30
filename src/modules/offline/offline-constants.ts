export const OFFLINE_DOCUMENT_LIMIT = 1000;
export const OFFLINE_IMAGE_COUNT_LIMIT = 100;
export const OFFLINE_IMAGE_BYTES_LIMIT = 10 * 1024 * 1024;
export const OFFLINE_FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function offlineSnapshotKey(userId: string, ledgerId: string) {
  return `${userId}:${ledgerId}`;
}
