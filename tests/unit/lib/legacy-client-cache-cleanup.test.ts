import { afterEach, describe, expect, it, vi } from "vitest";

async function loadCleanup() {
  vi.resetModules();
  return import("@/lib/legacy-client-cache-cleanup");
}

describe("legacy client cache cleanup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { deleteLegacyClientCache } = await loadCleanup();

    await expect(deleteLegacyClientCache()).resolves.toBeUndefined();
  });

  it("deletes the retired cache database once per application load", async () => {
    const request = {} as IDBOpenDBRequest;
    const deleteDatabase = vi.fn().mockReturnValue(request);
    vi.stubGlobal("indexedDB", { deleteDatabase });
    const { deleteLegacyClientCache } = await loadCleanup();

    const first = deleteLegacyClientCache();
    const second = deleteLegacyClientCache();

    expect(second).toBe(first);
    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(deleteDatabase).toHaveBeenCalledWith("cashier-cache");

    request.onsuccess?.(new Event("success"));
    await expect(first).resolves.toBeUndefined();
  });

  it("rejects when deleting the retired database fails", async () => {
    const request = {} as IDBOpenDBRequest;
    const error = new Error("delete failed");
    Object.defineProperty(request, "error", { value: error });
    vi.stubGlobal("indexedDB", { deleteDatabase: vi.fn().mockReturnValue(request) });
    const { deleteLegacyClientCache } = await loadCleanup();

    const deletion = deleteLegacyClientCache();
    request.onerror?.(new Event("error"));

    await expect(deletion).rejects.toBe(error);
  });
});
