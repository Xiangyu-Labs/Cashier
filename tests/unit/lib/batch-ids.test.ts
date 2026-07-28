import { describe, expect, it } from "vitest";
import { parseBatchIds } from "@/lib/batch-ids";

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("parseBatchIds", () => {
  it("deduplicates IDs before enforcing the batch limit", () => {
    expect(parseBatchIds(Array.from({ length: 101 }, () => id(1)))).toEqual([id(1)]);
    expect(parseBatchIds(Array.from({ length: 100 }, (_, index) => id(index)))).toHaveLength(100);
  });

  it("rejects empty, invalid, and oversized batches", () => {
    expect(() => parseBatchIds([])).toThrow();
    expect(() => parseBatchIds(["bad-id"])).toThrow();
    expect(() => parseBatchIds(Array.from({ length: 101 }, (_, index) => id(index)))).toThrow();
  });
});
