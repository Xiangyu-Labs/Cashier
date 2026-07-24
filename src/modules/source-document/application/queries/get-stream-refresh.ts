import { createHash } from "node:crypto";
import { currentApplication } from "@/application/current";
import { listStreamPage } from "./list-stream-page";
import type {
  SourceDocumentListItemDto,
  StreamPage,
} from "@/modules/source-document/contracts";
import {
  getSourceDocumentCountsQuery,
} from "@/modules/source-document/application/queries/get-source-document-counts";
import type {
  StreamRefreshRequest,
  StreamRefreshResult,
} from "@/modules/source-document/contract-refresh";
import {
  STREAM_REFRESH_PROTOCOL_VERSION,
  MAX_WATCHED_IDS,
  MAX_FILTER_SIGNATURES,
} from "@/modules/source-document/contract-refresh";

// ---------------------------------------------------------------------------
// Fingerprint helpers (server-side only)
// ---------------------------------------------------------------------------

/**
 * Compute a short SHA-256 fingerprint from a list of items.
 * Derives from canonical IDs and updatedAt timestamps.
 */
function computeItemFingerprint(items: SourceDocumentListItemDto[]): string {
  if (items.length === 0) return "";
  return createHash("sha256")
    .update(items.map((i) => `${i.id}:${i.updatedAt}`).join(","))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Compute a fingerprint for a single watched document.
 */
function computeDocumentFingerprint(doc: SourceDocumentListItemDto): string {
  return createHash("sha256")
    .update(`${doc.id}:${doc.updatedAt}:${doc.status}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Compute a fingerprint for global counts.
 */
export function computeCountFingerprint(counts: {
  processingCount: number;
  attentionCount: number;
}): string {
  return createHash("sha256")
    .update(`${counts.processingCount},${counts.attentionCount}`)
    .digest("hex")
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Bounded watched-entity loading
// ---------------------------------------------------------------------------

async function loadWatchedDocuments(
  ledgerId: string,
  watchedIds: string[]
): Promise<Map<string, SourceDocumentListItemDto | null>> {
  if (watchedIds.length === 0) return new Map();

  // Load in a single bounded batch using the raw read model
  const docs = await currentApplication.sourceDocumentReads.list({
    ledgerId,
    limit: watchedIds.length,
  });

  // Build a map from the loaded items
  const docMap = new Map<string, SourceDocumentListItemDto | null>();
  for (const id of watchedIds) {
    if (!docMap.has(id)) {
      // Not pre-loaded; mark as potentially deleted
      docMap.set(id, null);
    }
  }

  // Check loaded items
  for (const doc of docs.items) {
    if (watchedIds.includes(doc.id)) {
      docMap.set(doc.id, doc);
    }
  }

  // For watched IDs not in the loaded batch, try to load individually
  // (this is bounded by MAX_WATCHED_IDS)
  const missingIds = watchedIds.filter((id) => !docs.items.some((d) => d.id === id));
  for (const id of missingIds) {
    const fullDoc = await currentApplication.sourceDocumentReads.get(ledgerId, id);
    if (fullDoc != null) {
      // Convert full DTO to list item DTO shape
      docMap.set(id, {
        id: fullDoc.id,
        ledgerId: fullDoc.ledgerId,
        title: fullDoc.title,
        text: null,
        files: [],
        status: fullDoc.status,
        type: fullDoc.type,
        anomalyReason: fullDoc.anomalyReason,
        entryDate: fullDoc.entryDate,
        metadata: {},
        createdAt: fullDoc.createdAt,
        updatedAt: fullDoc.updatedAt,
        deletedAt: fullDoc.deletedAt,
        hasImages: fullDoc.hasImages ?? false,
        supportedActions: fullDoc.supportedActions,
        errorCode: fullDoc.errorCode,
        pendingRevisionId: fullDoc.pendingRevisionId,
      });
    }
    // If not found, it's been deleted — docMap already has null
  }

  return docMap;
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Bounded refresh query.
 *
 * Takes a client's refresh request and returns only the data that has changed:
 * first pages whose fingerprints differ, watched documents whose state changed,
 * and counts if their fingerprint changed.
 *
 * Bounded by MAX_WATCHED_IDS and MAX_FILTER_SIGNATURES.
 */
export async function getStreamRefresh(
  request: StreamRefreshRequest
): Promise<StreamRefreshResult> {
  const { ledgerId, signatures, watchedIds, countFingerprint } = request;

  // Apply bounds
  const boundedSignatures = signatures.slice(0, MAX_FILTER_SIGNATURES);
  const boundedWatchedIds = watchedIds.slice(0, MAX_WATCHED_IDS);

  // ---------------------------------------------------------------
  // 1. Refresh first pages for each active filter signature
  // ---------------------------------------------------------------
  const firstPages: Array<{
    filterSignature: string;
    fingerprint: string;
    page: StreamPage | null;
  }> = [];

  for (const sig of boundedSignatures) {
    try {
      // Decode signature — currently format is "startDate|endDate|minAmount|maxAmount|statuses"
      // We need to reconstruct the listStreamPage input from it
      const decoded = decodeFilterSignature(sig.filterSignature);
      if (decoded == null) continue;

      const page = await listStreamPage(ledgerId, {
        ...(decoded.startDate !== undefined ? { startDate: decoded.startDate } : {}),
        ...(decoded.endDate !== undefined ? { endDate: decoded.endDate } : {}),
        ...(decoded.minAmount !== undefined ? { minAmount: decoded.minAmount } : {}),
        ...(decoded.maxAmount !== undefined ? { maxAmount: decoded.maxAmount } : {}),
        ...(decoded.statuses !== undefined ? { statuses: decoded.statuses } : {}),
        limit: 20,
      });

      const currentFingerprint = computeItemFingerprint(page.items);

      // Omit page data if unchanged
      if (currentFingerprint === sig.firstPageFingerprint) {
        firstPages.push({
          filterSignature: sig.filterSignature,
          fingerprint: currentFingerprint,
          page: null,
        });
      } else {
        firstPages.push({
          filterSignature: sig.filterSignature,
          fingerprint: currentFingerprint,
          page,
        });
      }
    } catch {
      // On error, report page as null so the client can refetch
      firstPages.push({
        filterSignature: sig.filterSignature,
        fingerprint: "",
        page: null,
      });
    }
  }

  // ---------------------------------------------------------------
  // 2. Refresh watched entities
  // ---------------------------------------------------------------
  const docMap = await loadWatchedDocuments(ledgerId, boundedWatchedIds);

  const changedWatched: Array<{
    id: string;
    doc: SourceDocumentListItemDto | null;
    fingerprint: string;
  }> = [];

  for (const id of boundedWatchedIds) {
    const doc = docMap.get(id);
    if (doc == null) {
      // Tombstone — document deleted
      changedWatched.push({ id, doc: null, fingerprint: "" });
    } else {
      changedWatched.push({
        id,
        doc,
        fingerprint: computeDocumentFingerprint(doc),
      });
    }
  }

  // ---------------------------------------------------------------
  // 3. Refresh global counts
  // ---------------------------------------------------------------
  let counts: StreamRefreshResult["counts"] = null;

  if (countFingerprint == null) {
    // Client has no counts yet — always include
    const rawCounts = await getSourceDocumentCountsQuery(ledgerId);
    counts = {
      ...rawCounts,
      fingerprint: computeCountFingerprint(rawCounts),
    };
  } else {
    const rawCounts = await getSourceDocumentCountsQuery(ledgerId);
    const currentCF = computeCountFingerprint(rawCounts);
    if (currentCF !== countFingerprint) {
      counts = {
        ...rawCounts,
        fingerprint: currentCF,
      };
    }
  }

  // ---------------------------------------------------------------
  // 4. Determine overall changed status
  // ---------------------------------------------------------------
  const anyPageChanged = firstPages.some((fp) => fp.page != null);
  const anyCountsChanged = counts != null;
  const anyWatchedChanged = changedWatched.length > 0;

  return {
    protocolVersion: STREAM_REFRESH_PROTOCOL_VERSION,
    generation: 1,
    changed: anyPageChanged || anyCountsChanged || anyWatchedChanged,
    hasTransitionalWork: changedWatched.some(
      (w) =>
        w.doc != null &&
        (w.doc.status === "queued" || w.doc.status === "processing")
    ),
    firstPages,
    changedWatched,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Filter signature encoding/decoding
// ---------------------------------------------------------------------------

/**
 * Encode a set of filter params into a stable string key.
 * Used as the filter signature in refresh requests.
 */
export function encodeFilterSignature(params: {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  statuses?: string[];
}): string {
  const sortedStatuses = (params.statuses ?? []).slice().sort();
  const parts = [
    params.startDate ?? "",
    params.endDate ?? "",
    params.minAmount?.toString() ?? "",
    params.maxAmount?.toString() ?? "",
    ...sortedStatuses,
  ];
  return parts.join("|");
}

interface DecodedFilter {
  startDate: string | undefined;
  endDate: string | undefined;
  minAmount: number | undefined;
  maxAmount: number | undefined;
  statuses: string[] | undefined;
}

/**
 * Decode a filter signature back into filter params.
 */
function decodeFilterSignature(signature: string): DecodedFilter | null {
  const parts = signature.split("|");
  if (parts.length < 4) return null;

  const [startDate, endDate, minAmountStr, maxAmountStr, ...statusParts] = parts;

  const minAmount = minAmountStr !== "" ? Number(minAmountStr) : undefined;
  const maxAmount = maxAmountStr !== "" ? Number(maxAmountStr) : undefined;

  // Validate numeric parts
  if (minAmount !== undefined && Number.isNaN(minAmount)) return null;
  if (maxAmount !== undefined && Number.isNaN(maxAmount)) return null;

  return {
    startDate: startDate !== "" ? startDate : undefined,
    endDate: endDate !== "" ? endDate : undefined,
    minAmount,
    maxAmount,
    statuses: statusParts.length > 0 ? statusParts : undefined,
  };
}
