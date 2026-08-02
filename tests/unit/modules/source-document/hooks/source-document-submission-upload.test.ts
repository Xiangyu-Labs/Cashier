import { describe, expect, it, vi } from "vitest";
import { uploadSourceDocumentSubmissionImages } from "@/modules/source-document/hooks/source-document-submission-upload";

const onePixel = "data:image/jpeg;base64,AQ==";

describe("source-document inline submission preparation", () => {
  it("leaves text-only submissions unchanged", async () => {
    await expect(
      uploadSourceDocumentSubmissionImages("ledger-1", {
        entryDate: "2026-07-15",
        text: "Lunch",
      })
    ).resolves.toEqual({ entryDate: "2026-07-15", text: "Lunch" });
  });

  it("uploads compressed JPEG images through a signed direct plan", async () => {
    const compress = vi.fn().mockResolvedValue({ data: onePixel, mimeType: "image/jpeg" });
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-1",
      finalizationToken: "token",
      targets: [{ id: "target-1", url: "https://upload.test", requiredHeaders: {} }],
    });
    const put = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const finalize = vi.fn().mockResolvedValue(["file-1"]);
    const result = await uploadSourceDocumentSubmissionImages(
      "ledger-1",
      {
        entryDate: "2026-07-15",
        images: [{ data: onePixel, mimeType: "image/jpeg" }],
        originalImages: [{ data: onePixel, mimeType: "image/jpeg" }],
      },
      { compress, createPlan, put, finalize }
    );

    expect(compress).toHaveBeenCalledWith(expect.any(File), 1080, 1080, 0.78);
    expect(result).toEqual({
      entryDate: "2026-07-15",
      storedFileIds: ["file-1"],
    });
    expect(put).toHaveBeenCalledWith(
      "https://upload.test",
      expect.objectContaining({ method: "PUT", body: expect.any(File) })
    );
  });

  it("rejects compression failures instead of returning original bytes", async () => {
    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        { entryDate: "2026-07-15", images: [{ data: onePixel, mimeType: "image/jpeg" }] },
        { compress: vi.fn().mockRejectedValue(new Error("decode failed")) }
      )
    ).rejects.toMatchObject({ stage: "prepare" });
  });

  it("rejects more than three images before compression", async () => {
    const compress = vi.fn();
    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        {
          entryDate: "2026-07-15",
          images: Array.from({ length: 4 }, () => ({ data: onePixel, mimeType: "image/jpeg" })),
        },
        { compress }
      )
    ).rejects.toThrow("Maximum 3 images");
    expect(compress).not.toHaveBeenCalled();
  });
});
