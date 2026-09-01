/**
 * Runs `worker` over `items` with at most `limit` concurrent invocations.
 * Order of completion is not guaranteed; use this when a small pool of
 * external calls (rate-limit friendly) should run alongside each other
 * instead of strictly sequentially or all at once.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]!;
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
