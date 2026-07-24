import type { SourceDocumentListItemDto, StreamPage } from "./contracts";

export const STREAM_REFRESH_PROTOCOL_VERSION = 1;
export const MAX_WATCHED_IDS = 50;
export const MAX_FILTER_SIGNATURES = 10;

/**
 * Request from a client tab to the refresh server endpoint.
 * Contains enough information for the server to determine whether
 * the first page, watched entities, or counts have changed.
 */
export interface StreamRefreshRequest {
  ledgerId: string;
  protocolVersion: number;
  signatures: Array<{
    filterSignature: string;
    firstPageFingerprint: string | null;
  }>;
  watchedIds: string[];
  countFingerprint: string | null;
}

/**
 * Result from the refresh server endpoint.
 * Only includes changed data — unchanged pages/watched/counts are omitted.
 */
export interface StreamRefreshResult {
  protocolVersion: number;
  generation: number;
  changed: boolean;
  hasTransitionalWork: boolean;
  firstPages: Array<{
    filterSignature: string;
    fingerprint: string;
    page: StreamPage | null; // null when unchanged
  }>;
  changedWatched: Array<{
    id: string;
    doc: SourceDocumentListItemDto | null; // null = tombstone
    fingerprint: string;
  }>;
  counts: {
    processingCount: number;
    attentionCount: number;
    fingerprint: string;
  } | null; // null when unchanged
}
