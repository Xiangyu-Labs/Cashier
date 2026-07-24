"use server";

import { after } from "next/server";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getStreamRefresh } from "@/modules/source-document/application/queries/get-stream-refresh";
import { scheduleProcessingRecovery } from "./schedule-processing-recovery";
import type { StreamRefreshRequest, StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import {
  STREAM_REFRESH_PROTOCOL_VERSION,
  MAX_WATCHED_IDS,
  MAX_FILTER_SIGNATURES,
} from "@/modules/source-document/contract-refresh";
import { ValidationError } from "@/lib/errors";

/**
 * Bounded refresh server action.
 *
 * Checks whether the first page of each active filter signature,
 * watched source-document IDs, and global counts have changed,
 * returning only the changed data.
 *
 * Authorized via withLedgerAccess — each call independently authenticates.
 */
export const getStreamRefreshAction = withLedgerAccess(
  async (
    ledgerId: string,
    request: StreamRefreshRequest
  ): Promise<StreamRefreshResult> => {
    // Validate ledger ID consistency
    if (request.ledgerId !== ledgerId) {
      throw new ValidationError("Ledger ID mismatch");
    }

    // Validate protocol version
    if (request.protocolVersion !== STREAM_REFRESH_PROTOCOL_VERSION) {
      throw new ValidationError(
        `Unsupported protocol version ${request.protocolVersion}`
      );
    }

    // Apply request bounds
    if (request.signatures.length > MAX_FILTER_SIGNATURES) {
      throw new ValidationError(
        `Too many filter signatures (max ${MAX_FILTER_SIGNATURES})`
      );
    }
    if (request.watchedIds.length > MAX_WATCHED_IDS) {
      throw new ValidationError(
        `Too many watched IDs (max ${MAX_WATCHED_IDS})`
      );
    }

    // Schedule processing recovery alongside refresh
    after(() => scheduleProcessingRecovery(ledgerId));

    return getStreamRefresh(request);
  }
);
