"use server";

import { z } from "zod";
import { after } from "next/server";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getStreamRefresh } from "@/modules/source-document/application/queries/get-stream-refresh";
import { scheduleProcessingRecovery } from "./schedule-processing-recovery";
import type {
  StreamRefreshRequest,
  StreamRefreshResult,
} from "@/modules/source-document/contract-refresh";
import {
  STREAM_REFRESH_PROTOCOL_VERSION,
  MAX_WATCHED_IDS,
  MAX_FILTER_SIGNATURES,
} from "@/modules/source-document/contract-refresh";
import { ValidationError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// I4: Zod schema for validating refresh request input
// ---------------------------------------------------------------------------

const watchedIdSchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string(),
});

const signatureSchema = z.object({
  filterSignature: z.string().min(1),
  firstPageFingerprint: z.string().nullable(),
});

const streamRefreshRequestSchema = z.object({
  ledgerId: z.string().min(1),
  protocolVersion: z.literal(STREAM_REFRESH_PROTOCOL_VERSION),
  signatures: z.array(signatureSchema).max(MAX_FILTER_SIGNATURES),
  watchedIds: z.array(watchedIdSchema).max(MAX_WATCHED_IDS),
  countFingerprint: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

/**
 * Deduplicate signatures by filterSignature. Preserves first occurrence order.
 */
function deduplicateSignatures(
  signatures: Array<{ filterSignature: string; firstPageFingerprint: string | null }>
): Array<{ filterSignature: string; firstPageFingerprint: string | null }> {
  const seen = new Set<string>();
  return signatures.filter((s) => {
    if (seen.has(s.filterSignature)) return false;
    seen.add(s.filterSignature);
    return true;
  });
}

/**
 * Deduplicate watched IDs by id. Preserves first occurrence order.
 */
function deduplicateWatchedIds(
  watchedIds: Array<{ id: string; fingerprint: string }>
): Array<{ id: string; fingerprint: string }> {
  const seen = new Set<string>();
  return watchedIds.filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

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
  async (ledgerId: string, request: StreamRefreshRequest): Promise<StreamRefreshResult> => {
    // I4: Zod validation
    const parsed = streamRefreshRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new ValidationError("Invalid refresh request", { issues: parsed.error.issues });
    }

    // Validate ledger ID consistency
    if (parsed.data.ledgerId !== ledgerId) {
      throw new ValidationError("Ledger ID mismatch");
    }

    // I4: Deduplicate signatures by filterSignature
    const signatures = deduplicateSignatures(parsed.data.signatures);
    // I4: Deduplicate watched IDs by id
    const watchedIds = deduplicateWatchedIds(parsed.data.watchedIds);

    // Schedule processing recovery alongside refresh
    after(() => scheduleProcessingRecovery(ledgerId));

    return getStreamRefresh({
      ledgerId: parsed.data.ledgerId,
      protocolVersion: parsed.data.protocolVersion,
      signatures,
      watchedIds,
      countFingerprint: parsed.data.countFingerprint,
    });
  }
);
