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

    expect(compress).toHaveBeenCalledWith(expect.any(File), 1080, 1080, 0.78, undefined);
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

  it("stops after a pending upload plan resolves when the batch was cancelled", async () => {
    const controller = new AbortController();
    const compress = vi.fn().mockResolvedValue({ data: onePixel, mimeType: "image/jpeg" });
    let resolvePlan!: (plan: {
      id: string;
      expiresAt: string;
      finalizationToken: string;
      maxFiles: number;
      maxBytesPerFile: number;
      targets: {
        id: string;
        method: "PUT";
        url: string;
        requiredHeaders: Record<string, string>;
      }[];
    }) => void;
    const createPlan = vi.fn(
      () =>
        new Promise<{
          id: string;
          expiresAt: string;
          finalizationToken: string;
          maxFiles: number;
          maxBytesPerFile: number;
          targets: {
            id: string;
            method: "PUT";
            url: string;
            requiredHeaders: Record<string, string>;
          }[];
        }>((resolve) => {
          resolvePlan = resolve;
        })
    );
    const put = vi.fn();
    const finalize = vi.fn();
    const submission = uploadSourceDocumentSubmissionImages(
      "ledger-1",
      {
        entryDate: "2026-07-15",
        images: [{ data: onePixel, mimeType: "image/jpeg" }],
      },
      { compress, createPlan, put, finalize, signal: controller.signal }
    );

    await vi.waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    controller.abort();
    resolvePlan({
      id: "session-1",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "token",
      maxFiles: 3,
      maxBytesPerFile: 10_000_000,
      targets: [
        {
          id: "target-1",
          method: "PUT",
          url: "https://upload.test",
          requiredHeaders: {},
        },
      ],
    });

    await expect(submission).rejects.toMatchObject({ name: "AbortError" });
    expect(put).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("aborts an in-flight direct upload without finalizing the batch", async () => {
    const controller = new AbortController();
    const compress = vi.fn().mockResolvedValue({ data: onePixel, mimeType: "image/jpeg" });
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-1",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "token",
      maxFiles: 3,
      maxBytesPerFile: 10_000_000,
      targets: [
        {
          id: "target-1",
          method: "PUT",
          url: "https://upload.test",
          requiredHeaders: {},
        },
      ],
    });
    const put = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Upload aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const finalize = vi.fn();
    const submission = uploadSourceDocumentSubmissionImages(
      "ledger-1",
      {
        entryDate: "2026-07-15",
        images: [{ data: onePixel, mimeType: "image/jpeg" }],
      },
      { compress, createPlan, put, finalize, signal: controller.signal }
    );

    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(submission).rejects.toMatchObject({ name: "AbortError" });
    expect(finalize).not.toHaveBeenCalled();
  });
});
