import { describe, expect, it, vi } from "vitest";
import { uploadSourceDocumentSubmissionImages } from "@/modules/source-document/hooks/source-document-submission-upload";

describe("source-document submission uploads", () => {
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
    const sourceResponses = [
      new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/jpeg" } }),
      new Response(new Uint8Array([2, 3]), { headers: { "Content-Type": "image/png" } }),
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("source:")) return sourceResponses.shift()!;
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
          { data: "source:1", mimeType: "image/jpeg" },
          { data: "source:2", mimeType: "image/png" },
        ],
        originalImages: [{ data: "private-original", mimeType: "image/jpeg" }],
      },
      { createPlan, finalize, fetch: fetchMock as typeof fetch }
    );

    expect(createPlan).toHaveBeenCalledWith("ledger-1", [
      { contentType: "image/jpeg", byteSize: 1, originalFilename: null },
      { contentType: "image/png", byteSize: 2, originalFilename: null },
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
  });

  it("keeps authorized retry seed identities before newly uploaded files", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "source:new"
        ? new Response(new Uint8Array([4]), { headers: { "Content-Type": "image/webp" } })
        : new Response(null, { status: 201 })
    );
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
          images: [{ data: "source:new", mimeType: "image/webp" }],
        },
        { createPlan, finalize, fetch: fetchMock as typeof fetch }
      )
    ).resolves.toEqual({
      entryDate: "2026-07-15",
      storedFileIds: ["file-existing-1", "file-existing-2", "file-new"],
    });
  });
});
