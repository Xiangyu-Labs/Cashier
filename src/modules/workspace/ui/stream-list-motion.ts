/**
 * Dependency-free stream list motion helpers.
 *
 * Cards are tracked by their stable source-document ID across renders. The
 * diff below drives entrance fades, exit copies, FLIP reordering, and a
 * subtle crossfade for content updates. All animation work happens in the
 * hook/component layer and only touches `transform` and `opacity`.
 */

export const STREAM_CARD_ENTER_MS = 200;
export const STREAM_CARD_EXIT_MS = 200;
export const STREAM_CARD_FLIP_MS = 240;
export const STREAM_CARD_HIGHLIGHT_MS = 400;

export interface StreamListMotionItem {
  id: string;
  /** Date-group key the card currently renders under. */
  date: string;
  /** Content fingerprint; changes trigger a brief crossfade/highlight. */
  revision: string;
}

interface StreamListMotionExit {
  id: string;
  date: string;
  /** Index in the previous flat card list, used to place the exit copy. */
  index: number;
}

export interface StreamListMotionDiff {
  entering: Set<string>;
  exiting: StreamListMotionExit[];
  /** Cards that changed position or date group (FLIP candidates). */
  moving: Set<string>;
  /** Cards whose content changed in place (crossfade/highlight). */
  updated: Set<string>;
}

export const EMPTY_STREAM_LIST_MOTION_DIFF: StreamListMotionDiff = {
  entering: new Set(),
  exiting: [],
  moving: new Set(),
  updated: new Set(),
};

/**
 * Compute the transition between two ordered card lists.
 * `prev` and `next` are both in server order.
 */
export function computeStreamListMotionDiff(
  prev: readonly StreamListMotionItem[],
  next: readonly StreamListMotionItem[]
): StreamListMotionDiff {
  const prevById = new Map(prev.map((item, index) => [item.id, { item, index }]));
  const nextById = new Map(next.map((item, index) => [item.id, { item, index }]));
  const entering = new Set<string>();
  const exiting: StreamListMotionExit[] = [];
  const moving = new Set<string>();
  const updated = new Set<string>();

  for (const { item, index } of prevById.values()) {
    if (!nextById.has(item.id)) exiting.push({ id: item.id, date: item.date, index });
  }
  for (const { item, index } of nextById.values()) {
    const prevEntry = prevById.get(item.id);
    if (prevEntry == null) {
      entering.add(item.id);
      continue;
    }
    if (prevEntry.item.revision !== item.revision) updated.add(item.id);
    if (prevEntry.item.date !== item.date || prevEntry.index !== index) moving.add(item.id);
  }

  return { entering, exiting, moving, updated };
}

export function streamListMotionKey(items: readonly StreamListMotionItem[]): string {
  return items.map((item) => `${item.date}:${item.id}:${item.revision}`).join("|");
}
