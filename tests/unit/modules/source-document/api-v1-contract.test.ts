import { describe, expect, it } from "vitest";
import { createSourceDocumentInputSchemaV1 } from "@/modules/source-document/contract-schemas";

const image = { data: "AQ==", mimeType: "image/jpeg" };

describe("API v1 source-document contract", () => {
  it.each([
    ["2024-02-29", "2024-02-29"],
    ["2026-07-27T23:30:00+08:00", "2026-07-27"],
    ["2026-07-27T00:30:00-07:00", "2026-07-27"],
    ["2026-07-27T12:00:00Z", "2026-07-27"],
  ])("accepts %s and normalizes to %s", (entryDate, expected) => {
    expect(createSourceDocumentInputSchemaV1.parse({ images: [image], entryDate }).entryDate).toBe(
      expected
    );
  });

  it.each([
    "2023-02-29",
    "2026-02-30",
    "2026-07-27T12:00:00",
    "07/27/2026",
    "2026-07-27T24:00:00Z",
  ])("rejects invalid or timezone-less date %s", (entryDate) => {
    expect(() => createSourceDocumentInputSchemaV1.parse({ images: [image], entryDate })).toThrow();
  });
});
