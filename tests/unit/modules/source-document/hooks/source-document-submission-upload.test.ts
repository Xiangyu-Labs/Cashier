import { afterEach, describe, expect, it, vi } from "vitest";

const { createUploadPlanActionMock, finalizeUploadActionMock } = vi.hoisted(() => ({
  createUploadPlanActionMock: vi.fn(),
  finalizeUploadActionMock: vi.fn(),
}));

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentUploadPlanAction: createUploadPlanActionMock,
  finalizeSourceDocumentUploadAction: finalizeUploadActionMock,
}));

import { uploadSourceDocumentSubmissionImages } from "@/modules/source-document/hooks/source-document-submission-upload";

describe("source-document submission uploads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    createUploadPlanActionMock.mockReset();
    finalizeUploadActionMock.mockReset();
  });

  it("bypasses upload planning for text-only submissions", async () => {
    const createPlan = vi.fn();
    const finalize = vi.fn();
    const fetchMock = vi.fn();
    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        { entryDate: "2026-07-15", text: "Lunch" },
        { createPlan, finalize, fetch: fetchMock }
      )
    ).resolves.toEqual({ entryDate: "2026-07-15", text: "Lunch" });
    expect(createPlan).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("uploads in display order, finalizes targets, and returns only stored-file identities", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.startsWith("target:")) throw new Error(`Unexpected fetch URL: ${url}`);
      return new Response(null, { status: 201 });
    });
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-1",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "finalize",
      maxFiles: 10,
      maxBytesPerFile: 10,
      targets: [
        { id: "target-1", method: "PUT", url: "target:1", requiredHeaders: {} },
        { id: "target-2", method: "PUT", url: "target:2", requiredHeaders: {} },
      ],
    });
    const finalize = vi.fn().mockResolvedValue(["file-1", "file-2"]);

    const result = await uploadSourceDocumentSubmissionImages(
      "ledger-1",
      {
        entryDate: "2026-07-15",
        text: "Mixed",
        images: [
          { data: "data:image/jpeg;base64,AQ==", mimeType: "image/jpeg" },
          { data: "data:image/png;base64,AgM=", mimeType: "image/png" },
        ],
        originalImages: [{ data: "private-original", mimeType: "image/jpeg" }],
      },
      { createPlan, finalize, fetch: fetchMock as typeof fetch }
    );

    expect(createPlan).toHaveBeenCalledWith("ledger-1", [
      {
        contentType: "image/jpeg",
        byteSize: 1,
        originalFilename: null,
        checksum: "4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a",
      },
      {
        contentType: "image/png",
        byteSize: 2,
        originalFilename: null,
        checksum: "ee9040f65c341855e070ff438eb0ea9d5b831b2a2c270fb7ef592d750408e3b3",
      },
    ]);
    expect(finalize).toHaveBeenCalledWith("ledger-1", {
      uploadSessionId: "session-1",
      finalizationToken: "finalize",
      targetIds: ["target-1", "target-2"],
    });
    expect(result).toEqual({
      entryDate: "2026-07-15",
      text: "Mixed",
      storedFileIds: ["file-1", "file-2"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps authorized retry seed identities before newly uploaded files", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-2",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "finalize-2",
      maxFiles: 10,
      maxBytesPerFile: 10,
      targets: [{ id: "target-new", method: "PUT", url: "target:new", requiredHeaders: {} }],
    });
    const finalize = vi.fn().mockResolvedValue(["file-new"]);

    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        {
          entryDate: "2026-07-15",
          storedFileIds: ["file-existing-1", "file-existing-2"],
          images: [{ data: "data:image/webp;base64,BA==", mimeType: "image/webp" }],
        },
        { createPlan, finalize, fetch: fetchMock as typeof fetch }
      )
    ).resolves.toEqual({
      entryDate: "2026-07-15",
      storedFileIds: ["file-existing-1", "file-existing-2", "file-new"],
    });
  });

  it("rejects malformed local image data before creating an upload plan", async () => {
    const createPlan = vi.fn();
    const finalize = vi.fn();
    const fetchMock = vi.fn();

    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        {
          entryDate: "2026-07-15",
          images: [{ data: "blob:already-revoked", mimeType: "image/jpeg" }],
        },
        { createPlan, finalize, fetch: fetchMock }
      )
    ).rejects.toMatchObject({ stage: "prepare" });

    expect(createPlan).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("reports failed target requests as upload-stage errors", async () => {
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-3",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "finalize-3",
      maxFiles: 10,
      maxBytesPerFile: 10,
      targets: [{ id: "target-3", method: "PUT", url: "target:3", requiredHeaders: {} }],
    });
    const finalize = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 413 }));

    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        {
          entryDate: "2026-07-15",
          images: [{ data: "data:image/jpeg;base64,AQ==", mimeType: "image/jpeg" }],
        },
        { createPlan, finalize, fetch: fetchMock }
      )
    ).rejects.toMatchObject({ stage: "upload" });

    expect(finalize).not.toHaveBeenCalled();
  });

  it("reports aggregate byte progress through the upload transport", async () => {
    const createPlan = vi.fn().mockResolvedValue({
      id: "session-default",
      expiresAt: "2026-07-15T01:00:00.000Z",
      finalizationToken: "finalize-default",
      maxFiles: 10,
      maxBytesPerFile: 10,
      targets: [
        { id: "target-default", method: "PUT", url: "target:default", requiredHeaders: {} },
      ],
    });
    const finalize = vi.fn().mockResolvedValue(["file-default"]);
    const upload = vi.fn(
      async (_target, bytes: ArrayBuffer, onProgress: (loaded: number) => void) => {
        onProgress(bytes.byteLength);
      }
    );
    const progress = vi.fn();

    await expect(
      uploadSourceDocumentSubmissionImages(
        "ledger-1",
        {
          entryDate: "2026-07-15",
          images: [{ data: "data:image/jpeg;base64,AQ==", mimeType: "image/jpeg" }],
        },
        { createPlan, finalize, fetch: vi.fn(), upload },
        progress
      )
    ).resolves.toEqual({
      entryDate: "2026-07-15",
      storedFileIds: ["file-default"],
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "uploading", loadedBytes: 1, totalBytes: 1, percent: 100 })
    );
  });
});
