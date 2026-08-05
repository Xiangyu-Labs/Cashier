import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CACHED_IMAGE_BYTES_LIMIT,
  type CachedImageRecord,
  imageCacheKey,
  readCachedImages,
  readCachedImagesForFiles,
  selectCachedImageEvictions,
} from "@/modules/source-document/image-cache";

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

afterEach(() => {
  vi.unstubAllGlobals();
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
