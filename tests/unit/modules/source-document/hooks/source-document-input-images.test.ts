import { beforeEach, describe, expect, it, vi } from "vitest";

const { compressImageMock } = vi.hoisted(() => ({
  compressImageMock: vi.fn(),
}));

vi.mock("@/lib/image-utils", () => ({
  compressImage: compressImageMock,
}));

import { loadSourceDocumentInputFiles } from "@/modules/source-document/hooks/source-document-input-images";

describe("source-document input images", () => {
  beforeEach(() => {
    compressImageMock.mockReset();
  });

  it("uses the compressed image when browser decoding succeeds", async () => {
    compressImageMock.mockResolvedValue({
      data: "data:image/jpeg;base64,AQ==",
      mimeType: "image/jpeg",
    });

    const [result] = await loadSourceDocumentInputFiles([
      new File([new Uint8Array([1])], "receipt.png", { type: "image/png" }),
    ]);

    expect(result).toMatchObject({
      kind: "ready",
      image: { data: "data:image/jpeg;base64,AQ==", mimeType: "image/jpeg" },
    });
  });

  it("rejects unsupported originals when browser compression fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    compressImageMock.mockRejectedValue(new Error("decode failed"));

    await expect(
      loadSourceDocumentInputFiles([
        new File([new Uint8Array([1])], "receipt.heic", { type: "image/heic" }),
      ])
    ).resolves.toEqual([{ kind: "unsupported", fileName: "receipt.heic" }]);
  });
});
