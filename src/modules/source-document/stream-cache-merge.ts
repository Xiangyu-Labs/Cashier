import type { InfiniteData } from "@tanstack/react-query";
import type { SourceDocumentListItemDto, StreamPage } from "./contracts";

/**
 * Pure incremental stream-cache merge helpers.
 *
 * The server orders stream windows by (effectiveDate DESC, createdAt DESC,
 * id DESC), where effectiveDate is COALESCE(entry_date, UTC date of
 * created_at). These helpers mirror that total order on the client so local
 * delta merges never disagree with the next server page, and re-slice merged
 * windows back into the original page capacity.
 */

export const STREAM_PAGE_LIMIT = 20;

export interface StreamSortKey {
  effectiveDate: string;
  createdAt: string;
  id: string;
}

export function getSourceDocumentEffectiveDate(item: {
  entryDate?: string | null;
  createdAt: string;
}): string {
  if (item.entryDate != null && item.entryDate.trim() !== "") return item.entryDate;
  return item.createdAt.slice(0, 10);
}

export function getSourceDocumentSortKey(item: {
  entryDate?: string | null;
  createdAt: string;
  id: string;
}): StreamSortKey {
  return {
    effectiveDate: getSourceDocumentEffectiveDate(item),
    createdAt: item.createdAt,
    id: item.id,
  };
}

/**
 * Server-order comparison: effective date desc, createdAt desc, id desc.
 * Returns a negative number when `a` sorts after `b`.
 */
export function compareSourceDocumentServerOrder(
  a: { entryDate?: string | null; createdAt: string; id: string },
  b: { entryDate?: string | null; createdAt: string; id: string }
): number {
  const keyA = getSourceDocumentSortKey(a);
  const keyB = getSourceDocumentSortKey(b);
  if (keyA.effectiveDate !== keyB.effectiveDate) {
    return keyA.effectiveDate < keyB.effectiveDate ? 1 : -1;
  }
  if (keyA.createdAt !== keyB.createdAt) {
    return keyA.createdAt < keyB.createdAt ? 1 : -1;
  }
  if (keyA.id !== keyB.id) {
    return keyA.id < keyB.id ? 1 : -1;
  }
  return 0;
}

function encodePageCursor(ledgerId: string, item: SourceDocumentListItemDto): string | null {
  const { effectiveDate, createdAt, id } = getSourceDocumentSortKey(item);
  return `v2|${ledgerId}|${effectiveDate}|${createdAt}|${id}`;
}

export interface StreamDelta {
  upserts: readonly SourceDocumentListItemDto[];
  tombstones: readonly string[];
}

/**
 * Merge server deltas into one loaded stream window without resetting it.
 *
 * - Removes tombstones and items that no longer match the window.
 * - Replaces or inserts upserts using the authoritative server order.
 * - Re-slices the flat result into pages of `pageSize`, recomputing cursors
 *   for every page except the final one, which keeps the server-provided
 *   continuation cursor.
 *
 * When `guardVersion` is true (server delta / page calibration), stale
 * upserts (older updatedAt than the cached entity) never overwrite a newer
 * entity. Mutation reconciliation passes false so rollbacks can restore a
 * previous entity even when its timestamp is older.
 */
export function mergeStreamPageData(
  data: InfiniteData<StreamPage>,
  delta: StreamDelta,
  belongs: (item: SourceDocumentListItemDto) => boolean,
  pageSize: number,
  ledgerId: string,
  guardVersion = true
): InfiniteData<StreamPage> {
  const originalPages = data.pages;
  const generation = originalPages[0]?.generation ?? 1;
  const originalLastCursor = originalPages.at(-1)?.nextCursor ?? null;

  // Flatten in window order, first occurrence wins (mirrors the stream hook).
  const byId = new Map<string, SourceDocumentListItemDto>();
  for (const page of originalPages) {
    for (const item of page.items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  const tombstoneIds = new Set(delta.tombstones);
  for (const id of tombstoneIds) byId.delete(id);

  for (const incoming of delta.upserts) {
    const existing = byId.get(incoming.id);
    if (guardVersion && existing != null && existing.updatedAt > incoming.updatedAt) continue;
    byId.set(incoming.id, incoming);
  }

  const items = [...byId.values()].filter(belongs).sort(compareSourceDocumentServerOrder);

  const pages: StreamPage[] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push({
      items: items.slice(index, index + pageSize),
      nextCursor: null,
      generation,
    });
  }
  if (pages.length === 0) {
    pages.push({ items: [], nextCursor: null, generation });
  }

  // Cursor for every page except the final one is derived from its last item.
  // The final page keeps the original server continuation cursor so infinite
  // scrolling continues from the authoritative boundary; the background
  // refetch recalibrates any drift.
  for (let index = 0; index < pages.length - 1; index += 1) {
    const page = pages[index]!;
    const last = page.items.at(-1);
    pages[index] = {
      ...page,
      nextCursor: last == null ? null : encodePageCursor(ledgerId, last),
    };
  }
  if (pages.length > 0) {
    const lastPage = pages[pages.length - 1]!;
    pages[pages.length - 1] = {
      ...lastPage,
      nextCursor: originalLastCursor,
    };
  }

  const pageParams: (string | undefined)[] = pages.map((_, index) =>
    index === 0 ? undefined : (pages[index - 1]?.nextCursor ?? undefined)
  );

  return { pages, pageParams };
}
