import type { SourceDocumentListItemDto } from "./contracts";

export const LEDGER_DELTA_PROTOCOL_VERSION = 2;
export const STREAM_REFRESH_PROTOCOL_VERSION = LEDGER_DELTA_PROTOCOL_VERSION;
export const MAX_DELTA_VERSIONS = 100;
export const MAX_DELTA_DOCUMENTS = 200;

export interface LedgerDeltaRequest {
  ledgerId: string;
  afterVersion: string;
}

export interface LedgerDeltaResult {
  protocolVersion: number;
  fromVersion: string;
  toVersion: string;
  hasMore: boolean;
  resetRequired: boolean;
  changed: boolean;
  hasTransitionalWork: boolean;
  documents: SourceDocumentListItemDto[];
  tombstones: string[];
  counts: { processingCount: number; attentionCount: number } | null;
  invalidations: {
    categories: boolean;
    settings: boolean;
    stats: boolean;
  };
}

// Retained aliases keep the refresh coordinator API narrow while the wire protocol is v2.
export type StreamRefreshRequest = LedgerDeltaRequest;
export type StreamRefreshResult = LedgerDeltaResult;
