import { describe, expect, it } from "vitest";
import { buildSourceDocumentRetrySeed } from "@/modules/source-document/ui/source-document-retry-seed";

describe("source document retry seed", () => {
  it("preserves stored-file identity order without embedding a local URL", () => {
    const seed = buildSourceDocumentRetrySeed(
      { id: "doc-1", text: "fallback", files: [], hasImages: true },
      {
        text: "receipt",
        files: [
          { id: "file-2", contentType: "image/png", byteSize: 2, originalFilename: null },
          { id: "file-1", contentType: "image/jpeg", byteSize: 1, originalFilename: null },
        ],
      }
    );

    expect(seed.images).toEqual([
      { data: "", mimeType: "image/png", storedFileId: "file-2" },
      { data: "", mimeType: "image/jpeg", storedFileId: "file-1" },
    ]);
    expect(JSON.stringify(seed)).not.toContain("/api/uploads/");
    expect(JSON.stringify(seed)).not.toContain("storageKey");
  });
});
