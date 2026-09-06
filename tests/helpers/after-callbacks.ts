import { performance } from "node:perf_hooks";
import { clearTimeout, setTimeout } from "node:timers";

export function createAfterCallbackTracker() {
  const pending = new Set<Promise<void>>();
  const failures: unknown[] = [];

  function register(callback: () => unknown): void {
    let result: unknown;
    try {
      result = callback();
    } catch (error) {
      failures.push(error);
      return;
    }
    const task = Promise.resolve(result)
      .then(
        () => undefined,
        (error: unknown) => {
          failures.push(error);
        }
      )
      .finally(() => pending.delete(task));
    pending.add(task);
  }

  async function flush(timeoutMs = 2500): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (pending.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([...pending]),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error(`after() callbacks did not settle within ${timeoutMs}ms`)),
              Math.max(0, deadline - performance.now())
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures.splice(0), "after() callback failed");
    }
  }

  return { register, flush };
}
