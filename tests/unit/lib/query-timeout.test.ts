import { describe, expect, it, vi } from "vitest";
import { DETAIL_QUERY_TIMEOUT_MS, withQueryTimeout } from "@/lib/query-timeout";

describe("withQueryTimeout", () => {
  it("rejects a request that remains pending past the detail timeout", async () => {
    vi.useFakeTimers();
    try {
      const result = withQueryTimeout(new Promise<never>(() => undefined));
      const rejection = expect(result).rejects.toThrow("DETAIL_QUERY_TIMEOUT");

      await vi.advanceTimersByTimeAsync(DETAIL_QUERY_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a request result before the timeout", async () => {
    await expect(withQueryTimeout(Promise.resolve("detail"))).resolves.toBe("detail");
  });
});
