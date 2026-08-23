import { ValidationError } from "@/lib/errors";
import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
import type { SourceDocumentListItemDto, StreamPage } from "../../contracts";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import { normalizeSearchTerm } from "@/lib/search";
import type { LedgerChangeReadPort, SourceDocumentReadPort } from "../ports";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import { filterStreamEntries } from "../../stream-filter-policy";
import { createHash } from "node:crypto";

const STREAM_PAGE_LIMIT = 20;

export interface ListStreamPageInput {
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  minAmount?: string;
  maxAmount?: string;
  statuses?: string[];
  search?: string;
  cursor?: string | null | undefined;
  limit: number;
}

// ---------------------------------------------------------------------------
// Stream cursor helpers
// ---------------------------------------------------------------------------

/**
 * Decode a versioned stream cursor into its components.
 * Expected format: v2|ledgerId|effectiveDate|createdAt|id
 */
interface DecodedStreamCursor {
  ledgerId: string;
  generation: string;
  filterHash: string;
  innerCursor: string;
}

function decodeStreamCursor(cursor: string | null | undefined): DecodedStreamCursor | null {
  if (cursor == null || cursor === "") return null;
  const parts = cursor.split("|");
  if (parts.length !== 7) return null;
  const [version, decodedLedgerId, generation, filterHash, effectiveDate, createdAt, id] = parts;
  if (
    version !== "v3" ||
    !decodedLedgerId ||
    !/^\d+$/.test(generation ?? "") ||
    !/^[a-f0-9]{16}$/.test(filterHash ?? "") ||
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
    generation: generation!,
    filterHash: filterHash!,
    innerCursor: `${effectiveDate}|${createdAt}|${id}`,
  };
}

/**
 * Encode a versioned stream cursor from its components.
 */
function encodeStreamCursor(
  ledgerId: string,
  generation: string,
  filterHash: string,
  readModelCursor: string | null
): string | null {
  if (readModelCursor == null) return null;
  return `v3|${ledgerId}|${generation}|${filterHash}|${readModelCursor}`;
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
  generation: string,
  filterHash: string
): string | null {
  if (cursor == null || cursor === "") return null;
  const decoded = decodeStreamCursor(cursor);
  if (decoded == null) {
    throw new ValidationError("Invalid cursor format, restart required");
  }
  if (decoded.ledgerId !== ledgerId) {
    throw new ValidationError("Cross-ledger cursor, restart required");
  }
  if (decoded.generation !== generation || decoded.filterHash !== filterHash) {
    throw new ValidationError("Stale stream cursor, restart required");
  }
  return decoded.innerCursor;
}

function filterFingerprint(input: ListStreamPageInput, search: string | undefined): string {
  const normalized = {
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    statuses: [...new Set(input.statuses ?? [])].sort(),
    search: search?.trim() ?? null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Page query
// ---------------------------------------------------------------------------

export async function listStreamPage(
  ledgerId: string,
  input: ListStreamPageInput,
  ports: {
    documents: Pick<SourceDocumentReadPort, "list">;
    ledgerReads: Pick<LedgerReadPort, "listEntriesBySourceDocumentIds">;
    changes?: Pick<LedgerChangeReadPort, "getVersion">;
  }
): Promise<StreamPage> {
  // Enforce page size cap (defense in depth beyond the action schema)
  const limit = Math.min(input.limit, STREAM_PAGE_LIMIT);
  const search = normalizeSearchTerm(input.search);
  const filterHash = filterFingerprint(input, search);
  const beforeVersion = (await ports.changes?.getVersion(ledgerId)) ?? BigInt(0);
  const generation = beforeVersion.toString();

  // Validate cursor against ledger identity and filter compatibility.
  // Throws ValidationError for malformed/incompatible cursors so the client
  // can discard stale pages and restart from page one.
  let innerCursor: string | null;
  try {
    innerCursor = validateCursor(input.cursor, ledgerId, generation, filterHash);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { items: [], nextCursor: null, generation, restartRequired: true };
    }
    throw error;
  }

  const page = await ports.documents.list({
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
  const entriesByDocId = await listLedgerEntryViewsBySourceDocumentIds(
    {
      ledgerId,
      sourceDocumentIds: page.items.map((item) => item.id),
      includeDuplicatePending: true,
    },
    ports.ledgerReads
  );

  const items = page.items.map((item) => ({
    ...item,
    ledgerEntries: filterStreamEntries(entriesByDocId.get(item.id) ?? [], {
      ...(input.minAmount != null ? { minAmount: input.minAmount } : {}),
      ...(input.maxAmount != null ? { maxAmount: input.maxAmount } : {}),
      ...(search != null ? { search } : {}),
    }),
  }));
  const afterVersion = (await ports.changes?.getVersion(ledgerId)) ?? beforeVersion;
  if (afterVersion !== beforeVersion) {
    return {
      items: [],
      nextCursor: null,
      generation: afterVersion.toString(),
      restartRequired: true,
    };
  }

  return {
    items: items as SourceDocumentListItemDto[],
    nextCursor: encodeStreamCursor(ledgerId, generation, filterHash, page.nextCursor),
    generation,
  };
}
