export const LEDGER_DELTA_PROTOCOL_VERSION = 3;
export const MAX_DELTA_VERSIONS = 100;

export interface LedgerDeltaRequest {
  ledgerId: string;
  afterVersion: string;
}

export interface LedgerDeltaResult {
  protocolVersion: 3;
  fromVersion: string;
  toVersion: string;
  hasMore: boolean;
  resetRequired: boolean;
  changed: boolean;
  hasTransitionalWork: boolean;
  invalidations: {
    categories: boolean;
    settings: boolean;
    stats: boolean;
  };
}

// Retained alias keeps the refresh coordinator API narrow while the wire protocol is v2.
export type StreamRefreshResult = LedgerDeltaResult;
