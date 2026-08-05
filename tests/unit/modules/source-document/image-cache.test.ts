import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_IMAGE_STORE, openCacheDb, transactionDone } from "@/lib/client-cache";
import {
  CACHED_IMAGE_BYTES_LIMIT,
  type CachedImageRecord,
  cacheImage,
  imageCacheKey,
  readCachedImages,
  readCachedImagesForFiles,
  selectCachedImageEvictions,
} from "@/modules/source-document/image-cache";
import type { SourceDocumentStoredFileDto } from "@/modules/source-document/contracts";

function image(overrides: Partial<CachedImageRecord> & Pick<CachedImageRecord, "key">) {
  return {
    snapshotKey: "user:ledger",
    userId: "user",
    fileId: overrides.key,
    documentId: "document",
    contentType: "image/webp",
    byteSize: 1024,
    blob: new Blob(["x"]),
    lastAccessedAt: 1,
    ...overrides,
  } satisfies CachedImageRecord;
}

function storedFile(id: string): SourceDocumentStoredFileDto {
  return { id, contentType: "image/png", byteSize: 100, originalFilename: `${id}.png` };
}

function cacheImageInput(snapshotKey = "user:ledger", fileId = "file-1") {
  return {
    snapshotKey,
    documentId: "doc-1",
    documentTimestamp: "2026-08-01",
    file: storedFile(fileId),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  const db = await openCacheDb();
  const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readwrite");
  tx.objectStore(DOCUMENT_IMAGE_STORE).clear();
  await transactionDone(tx);
});

describe("cached image eviction", () => {
  it("evicts least-recently-accessed images first", () => {
    const records = [
      image({ key: "old", byteSize: CACHED_IMAGE_BYTES_LIMIT / 3, lastAccessedAt: 1 }),
      image({ key: "middle", byteSize: CACHED_IMAGE_BYTES_LIMIT / 3, lastAccessedAt: 2 }),
      image({ key: "new", byteSize: CACHED_IMAGE_BYTES_LIMIT / 3, lastAccessedAt: 3 }),
    ];
    expect(
      selectCachedImageEvictions(records, CACHED_IMAGE_BYTES_LIMIT / 3).map((x) => x.key)
    ).toEqual(["old"]);
  });

  it("enforces the 100 image count limit", () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      image({ key: `image-${index}`, lastAccessedAt: index })
    );
    expect(selectCachedImageEvictions(records, 1).map((x) => x.key)).toEqual(["image-0"]);
  });

  it("enforces the byte limit and can evict multiple records", () => {
    const records = [
      image({ key: "a", byteSize: 6_000_000, lastAccessedAt: 1 }),
      image({ key: "b", byteSize: 5_000_000, lastAccessedAt: 2 }),
    ];
    expect(selectCachedImageEvictions(records, 2_000_000).map((x) => x.key)).toEqual(["a"]);
    expect(selectCachedImageEvictions(records, 6_000_000).map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("does not count a replaced record twice", () => {
    const records = [image({ key: "same", byteSize: CACHED_IMAGE_BYTES_LIMIT })];
    expect(selectCachedImageEvictions(records, 1024, "same")).toEqual([]);
  });

  it("builds stable cache keys from snapshot and file ids", () => {
    expect(imageCacheKey("user:ledger", "file-1")).toBe("user:ledger:file-1");
  });
});

describe("cached image reads", () => {
  it("returns an empty list without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(readCachedImages("user:ledger")).resolves.toEqual([]);
    await expect(readCachedImagesForFiles("user:ledger", ["file-1"])).resolves.toEqual([]);
  });
});

describe("cacheImage single-flight", () => {
  it("dedupes concurrent requests for the same snapshot key and file id", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["x"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      cacheImage(cacheImageInput()),
      cacheImage(cacheImageInput()),
      cacheImage(cacheImageInput()),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((record) => record?.key === "user:ledger:file-1")).toBe(true);
  });

  it("does not share requests across snapshot keys", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["x"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      cacheImage(cacheImageInput("user:ledger")),
      cacheImage(cacheImageInput("user:other")),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows a retry after a failed request", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response(new Blob(["x"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cacheImage(cacheImageInput())).rejects.toThrow("network");
    await expect(cacheImage(cacheImageInput())).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the updated record with the refreshed access time on a cache hit", async () => {
    const db = await openCacheDb();
    const tx = db.transaction(DOCUMENT_IMAGE_STORE, "readwrite");
    tx.objectStore(DOCUMENT_IMAGE_STORE).put({
      key: "user:ledger:file-1",
      snapshotKey: "user:ledger",
      userId: "user",
      fileId: "file-1",
      documentId: "doc-1",
      contentType: "image/png",
      byteSize: 100,
      blob: new Blob(["old"]),
      lastAccessedAt: 1,
    });
    await transactionDone(tx);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const before = Date.now();
    const record = await cacheImage(cacheImageInput());

    expect(record?.lastAccessedAt).toBeGreaterThanOrEqual(before);
    expect(record?.lastAccessedAt).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const stored = await readCachedImagesForFiles("user:ledger", ["file-1"]);
    expect(stored[0]?.lastAccessedAt).toBe(record?.lastAccessedAt);
  });
});
