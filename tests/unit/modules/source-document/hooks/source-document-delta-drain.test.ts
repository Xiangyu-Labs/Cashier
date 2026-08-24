import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStreamRefreshActionMock, applyStreamRefreshToCacheMock } = vi.hoisted(() => ({
  getStreamRefreshActionMock: vi.fn(),
  applyStreamRefreshToCacheMock: vi.fn(),
}));

vi.mock("@/modules/source-document/actions", () => ({
  getStreamRefreshAction: getStreamRefreshActionMock,
}));
vi.mock("@/modules/source-document/hooks/stream-refresh-cache", () => ({
  applyStreamRefreshToCache: applyStreamRefreshToCacheMock,
}));

import { drainSourceDocumentDelta } from "@/modules/source-document/hooks/source-document-delta-drain";

function delta(version: number, hasMore: boolean) {
  return {
    protocolVersion: 3 as const,
    fromVersion: String(version - 1),
    toVersion: String(version),
    hasMore,
    resetRequired: false,
    changed: true,
    hasTransitionalWork: false,
    invalidations: { categories: false, settings: false, stats: version === 2 },
  };
}

describe("drainSourceDocumentDelta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares one in-flight drain per QueryClient and ledger", async () => {
    const queryClient = new QueryClient();
    let resolve!: (value: ReturnType<typeof delta>) => void;
    getStreamRefreshActionMock.mockReturnValueOnce(
      new Promise((next) => {
        resolve = next;
      })
    );

    const first = drainSourceDocumentDelta(queryClient, "ledger-1", "0");
    const second = drainSourceDocumentDelta(queryClient, "ledger-1", "0");
    expect(first).toBe(second);
    expect(getStreamRefreshActionMock).toHaveBeenCalledTimes(1);

    resolve(delta(1, false));
    await expect(first).resolves.toMatchObject({ changed: true });
    expect(applyStreamRefreshToCacheMock).toHaveBeenCalledTimes(1);
  });

  it("merges pages and resets once when ten pages leave a backlog", async () => {
    const queryClient = new QueryClient();
    for (let version = 1; version <= 10; version += 1) {
      getStreamRefreshActionMock.mockResolvedValueOnce(delta(version, true));
    }

    const drained = await drainSourceDocumentDelta(queryClient, "ledger-2", "0");

    expect(getStreamRefreshActionMock).toHaveBeenCalledTimes(10);
    expect(drained.result).toMatchObject({
      fromVersion: "0",
      toVersion: "10",
      hasMore: false,
      resetRequired: true,
      invalidations: { stats: true },
    });
    expect(applyStreamRefreshToCacheMock).toHaveBeenCalledTimes(1);
  });

  it("does not advance the cursor when cache invalidation fails", async () => {
    const queryClient = new QueryClient();
    getStreamRefreshActionMock.mockResolvedValue(delta(1, false));
    applyStreamRefreshToCacheMock.mockRejectedValueOnce(new Error("invalidation failed"));

    await expect(drainSourceDocumentDelta(queryClient, "ledger-3", "0")).rejects.toThrow(
      "invalidation failed"
    );
    applyStreamRefreshToCacheMock.mockResolvedValue(undefined);
    await drainSourceDocumentDelta(queryClient, "ledger-3", "0");

    expect(getStreamRefreshActionMock).toHaveBeenNthCalledWith(2, "ledger-3", {
      ledgerId: "ledger-3",
      afterVersion: "0",
    });
  });

  it("keeps timed-out work in flight and does not commit its cursor", async () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      let releaseInvalidation!: () => void;
      applyStreamRefreshToCacheMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          releaseInvalidation = resolve;
        })
      );
      getStreamRefreshActionMock.mockResolvedValue(delta(1, false));

      const first = drainSourceDocumentDelta(queryClient, "ledger-4", "0");
      const rejection = expect(first).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;

      const overlapping = drainSourceDocumentDelta(queryClient, "ledger-4", "0");
      expect(overlapping).toBe(first);
      expect(getStreamRefreshActionMock).toHaveBeenCalledTimes(1);

      releaseInvalidation();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      applyStreamRefreshToCacheMock.mockResolvedValue(undefined);
      await drainSourceDocumentDelta(queryClient, "ledger-4", "0");

      expect(getStreamRefreshActionMock).toHaveBeenNthCalledWith(2, "ledger-4", {
        ledgerId: "ledger-4",
        afterVersion: "0",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
