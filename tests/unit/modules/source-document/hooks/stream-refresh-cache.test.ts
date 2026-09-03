import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { LedgerRefreshResult } from "@/modules/source-document/contract-refresh";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";

function makeResult(overrides: Partial<LedgerRefreshResult> = {}): LedgerRefreshResult {
  return {
    version: "1",
    changed: false,
    hasTransitionalWork: false,
    invalidations: { categories: false, settings: false, stats: false },
    ...overrides,
  };
}

describe("applyStreamRefreshToCache", () => {
  it("does not invalidate anything for an unchanged signal", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyStreamRefreshToCache(client, "ledger-1", makeResult());

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates stream, total, documents, and ledger entries after a change", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyStreamRefreshToCache(client, "ledger-1", makeResult({ changed: true }));

    expect(invalidate).toHaveBeenCalledTimes(5);
    for (const call of invalidate.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ predicate: expect.any(Function) }));
    }
  });

  it.each([
    ["categories", { categories: true, settings: false, stats: false }],
    ["settings", { categories: false, settings: true, stats: false }],
  ])("invalidates ledger settings for %s changes", (_name, invalidations) => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyStreamRefreshToCache(client, "ledger-1", makeResult({ invalidations }));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("invalidates stats for a stats signal", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    applyStreamRefreshToCache(
      client,
      "ledger-1",
      makeResult({
        invalidations: { categories: false, settings: false, stats: true },
      })
    );

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
