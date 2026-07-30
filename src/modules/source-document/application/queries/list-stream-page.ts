import { createHash } from "node:crypto";
import { currentApplication } from "@/application/current";
import { ValidationError } from "@/lib/errors";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentListItemDto, StreamPage } from "../../contracts";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import { normalizeSearchTerm } from "@/lib/search";
import { compare } from "@/lib/money/decimal";

const STREAM_PAGE_LIMIT = 20;

function filterCardEntries(
  entries: SourceDocumentListItemDto["ledgerEntries"],
  input: Pick<ListStreamPageInput, "minAmount" | "maxAmount" | "search">
) {
  if (entries == null) return [];
  const query = input.search?.toLocaleLowerCase();
  if (input.minAmount == null && input.maxAmount == null && !query) return entries;
  return entries.filter((entry) => {
    const amount = entry.convertedAmount ?? entry.amount;
    if (input.minAmount != null && compare(amount, String(input.minAmount)) < 0) return false;
    if (input.maxAmount != null && compare(amount, String(input.maxAmount)) > 0) return false;
    if (query) {
      const text = [entry.itemName, entry.description]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

export interface ListStreamPageInput {
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  minAmount?: number;
  maxAmount?: number;
  statuses?: string[];
  search?: string;
  cursor?: string | null | undefined;
  limit: number;
}

// ---------------------------------------------------------------------------
// Filter fingerprint
// ---------------------------------------------------------------------------

/**
 * Compute a stable 8-hex-char fingerprint of the normalized filter values.
 * Used to detect incompatible cursor reuse across filter combinations.
 */
export function computeFilterFingerprint(input: ListStreamPageInput): string {
  const hash = createHash("sha256");
  const sortedStatuses = (input.statuses ?? []).slice().sort();
  const parts = [
    input.startDate ?? "",
    input.endDate ?? "",
    input.minAmount?.toString() ?? "",
    input.maxAmount?.toString() ?? "",
    input.search ?? "",
    ...sortedStatuses,
  ].join("\0");
  hash.update(parts);
  return hash.digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Stream cursor helpers
// ---------------------------------------------------------------------------

/**
 * Decode a versioned stream cursor into its components.
 * Expected format: v1|ledgerId|filterFingerprint|effectiveDate|createdAt|id
 */
interface DecodedStreamCursor {
  ledgerId: string;
  filterFingerprint: string;
  innerCursor: string;
}

function decodeStreamCursor(cursor: string | null | undefined): DecodedStreamCursor | null {
  if (cursor == null || cursor === "") return null;
  const parts = cursor.split("|");
  if (parts.length !== 6) return null;
  const [version, decodedLedgerId, filterFingerprint, effectiveDate, createdAt, id] = parts;
  if (
    version !== "v1" ||
    !decodedLedgerId ||
    !filterFingerprint ||
    !effectiveDate ||
    !createdAt ||
    !id
  ) {
    return null;
  }
  // Validate effectiveDate format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return null;
  // Validate createdAt is a parseable ISO date string
  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) return null;
  return {
    ledgerId: decodedLedgerId,
    filterFingerprint,
    innerCursor: `${effectiveDate}|${createdAt}|${id}`,
  };
}

/**
 * Encode a versioned stream cursor from its components.
 */
function encodeStreamCursor(
  ledgerId: string,
  filterFingerprint: string,
  readModelCursor: string | null
): string | null {
  if (readModelCursor == null) return null;
  return `v1|${ledgerId}|${filterFingerprint}|${readModelCursor}`;
}

/**
 * Validate that a cursor is compatible with the current ledger and filter inputs.
 * Returns the decoded inner cursor string for a valid cursor, or null when no
 * cursor was provided (first-page fetch).
 * Throws ValidationError for malformed, incompatible, or stale cursors so the
 * caller can signal the client to restart from page one.
 */
function validateCursor(
  cursor: string | null | undefined,
  ledgerId: string,
  filterFingerprint: string
): string | null {
  if (cursor == null || cursor === "") return null;
  const decoded = decodeStreamCursor(cursor);
  if (decoded == null) {
    throw new ValidationError("Invalid cursor format, restart required");
  }
  if (decoded.ledgerId !== ledgerId) {
    throw new ValidationError("Cross-ledger cursor, restart required");
  }
  if (decoded.filterFingerprint !== filterFingerprint) {
    throw new ValidationError("Incompatible cursor filters, restart required");
  }
  return decoded.innerCursor;
}

// ---------------------------------------------------------------------------
// Page query
// ---------------------------------------------------------------------------

export async function listStreamPage(
  ledgerId: string,
  input: ListStreamPageInput
): Promise<StreamPage> {
  // Enforce page size cap (defense in depth beyond the action schema)
  const limit = Math.min(input.limit, STREAM_PAGE_LIMIT);
  const search = normalizeSearchTerm(input.search);

  // Compute filter fingerprint before cursor validation
  const filterFingerprint = computeFilterFingerprint({
    ...input,
    ...(search != null ? { search } : {}),
  });

  // Validate cursor against ledger identity and filter compatibility.
  // Throws ValidationError for malformed/incompatible cursors so the client
  // can discard stale pages and restart from page one.
  let innerCursor: string | null;
  try {
    innerCursor = validateCursor(input.cursor, ledgerId, filterFingerprint);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { items: [], nextCursor: null, generation: 1, restartRequired: true };
    }
    throw error;
  }

  const page = await currentApplication.sourceDocumentReads.list({
    ledgerId,
    ...(input.statuses != null && input.statuses.length > 0
      ? { statuses: input.statuses as unknown as SourceDocumentStatusType[] }
      : {}),
    ...(input.startDate != null && input.startDate !== "" ? { startDate: input.startDate } : {}),
    ...(input.endDate != null && input.endDate !== "" ? { endDate: input.endDate } : {}),
    ...(input.minAmount != null ? { minAmount: input.minAmount } : {}),
    ...(input.maxAmount != null ? { maxAmount: input.maxAmount } : {}),
    ...(search != null ? { search } : {}),
    ...(innerCursor != null ? { cursor: innerCursor } : {}),
    limit,
  });

  // Batch-load ledger entries for items that need them (completed cards etc.)
  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds({
    ledgerId,
    sourceDocumentIds: page.items.map((item) => item.id),
  });

  const items = page.items.map((item) => ({
    ...item,
    ledgerEntries: filterCardEntries(entriesByDocId.get(item.id) ?? [], {
      ...(input.minAmount != null ? { minAmount: input.minAmount } : {}),
      ...(input.maxAmount != null ? { maxAmount: input.maxAmount } : {}),
      ...(search != null ? { search } : {}),
    }),
  }));

  return {
    items: items as SourceDocumentListItemDto[],
    nextCursor: encodeStreamCursor(ledgerId, filterFingerprint, page.nextCursor),
    generation: 1,
  };
}
