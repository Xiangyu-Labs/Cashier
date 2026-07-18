import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/lib/errors";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";

const ledger = {
  id: "ledger-1",
  userId: "user-1",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("retrySourceDocument", () => {
  const createPendingWithIntent = vi.fn();
  const scheduleProcessing = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createPendingWithIntent.mockResolvedValue({
      document: { id: "doc-1" },
      revision: { id: "revision-2" },
      intent: { id: "intent-2" },
    });
  });

  it("propagates missing-document failures without dispatch", async () => {
    createPendingWithIntent.mockRejectedValueOnce(new NotFoundError("Source document"));
    await expect(
      retrySourceDocument(
        { ledgerId: ledger.id, ledger, sourceDocumentId: "missing" },
        { submissions: { createPendingWithIntent }, scheduleProcessing }
      )
    ).rejects.toThrow(NotFoundError);
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });

  it("creates a new revision under the stable document identity and inherits evidence", async () => {
    const result = await retrySourceDocument(
      { ledgerId: ledger.id, ledger, sourceDocumentId: "doc-1" },
      { submissions: { createPendingWithIntent }, scheduleProcessing }
    );
    expect(createPendingWithIntent).toHaveBeenCalledWith({
      ledgerId: ledger.id,
      sourceDocumentId: "doc-1",
      inheritEvidence: true,
    });
    expect(scheduleProcessing).toHaveBeenCalledWith({ id: "intent-2" });
    // ordering: scheduleProcessing must be called AFTER createPendingWithIntent completes
    expect(createPendingWithIntent.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleProcessing.mock.invocationCallOrder[0]!
    );
    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      previousSourceDocumentId: "doc-1",
      status: "queued",
    });
  });

  it("creates immutable edit-retry evidence from finalized file identities", async () => {
    await retrySourceDocument(
      {
        ledgerId: ledger.id,
        ledger,
        sourceDocumentId: "doc-1",
        input: {
          text: "corrected",
          entryDate: "2026-07-16",
          storedFileIds: ["00000000-0000-4000-8000-000000000001"],
        },
      },
      { submissions: { createPendingWithIntent }, scheduleProcessing }
    );
    expect(createPendingWithIntent).toHaveBeenCalledWith({
      ledgerId: ledger.id,
      sourceDocumentId: "doc-1",
      inheritEvidence: true,
      submittedText: "corrected",
      entryDate: "2026-07-16",
      storedFileIds: ["00000000-0000-4000-8000-000000000001"],
    });
  });

  it("rejects raw image retry payloads without scheduling processing", async () => {
    await expect(
      retrySourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          sourceDocumentId: "doc-1",
          input: { images: [{ data: "raw", mimeType: "image/jpeg" }] },
        },
        { submissions: { createPendingWithIntent }, scheduleProcessing }
      )
    ).rejects.toThrow("Images must be finalized");
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });
});
