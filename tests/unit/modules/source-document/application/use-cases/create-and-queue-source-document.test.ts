import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "@/modules/source-document/application/use-cases/create-and-queue-source-document";

const ledger = {
  id: "ledger-1",
  userId: "user-1",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("createAndQueueSourceDocument", () => {
  const createPendingWithIntent = vi.fn();
  const triggerProcessing = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createPendingWithIntent.mockResolvedValue({
      document: { id: "doc-1" },
      revision: { id: "revision-1" },
      intent: { id: "intent-1" },
    });
  });

  it("rejects an empty submission before creating durable state", async () => {
    await expect(
      createAndQueueSourceDocument(
        { ledgerId: ledger.id, ledger },
        { submissions: { createPendingWithIntent }, triggerProcessing }
      )
    ).rejects.toThrow(ValidationError);
    expect(createPendingWithIntent).not.toHaveBeenCalled();
  });

  it("creates text evidence and durable intent before triggering dispatch", async () => {
    const result = await createAndQueueSourceDocument(
      { ledgerId: ledger.id, ledger, text: "Lunch receipt", entryDate: "2026-07-15" },
      { submissions: { createPendingWithIntent }, triggerProcessing }
    );

    expect(createPendingWithIntent).toHaveBeenCalledWith({
      ledgerId: ledger.id,
      submittedText: "Lunch receipt",
      storedFileIds: [],
      entryDate: "2026-07-15",
    });
    expect(triggerProcessing).toHaveBeenCalledWith({ id: "intent-1" });
    expect(createPendingWithIntent.mock.invocationCallOrder[0]).toBeLessThan(
      triggerProcessing.mock.invocationCallOrder[0]!
    );
    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      revisionId: "revision-1",
      revisionState: "queued",
    });
  });

  it("submits finalized stored-file identities without raw image material", async () => {
    await createAndQueueSourceDocument(
      {
        ledgerId: ledger.id,
        ledger,
        text: "Mixed receipt",
        storedFileIds: ["00000000-0000-4000-8000-000000000001"],
      },
      { submissions: { createPendingWithIntent }, triggerProcessing }
    );
    expect(createPendingWithIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedText: "Mixed receipt",
        storedFileIds: ["00000000-0000-4000-8000-000000000001"],
      })
    );
  });

  it("rejects raw images that bypass upload finalization", async () => {
    await expect(
      createAndQueueSourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          images: [{ data: "data:image/jpeg;base64,YQ==", mimeType: "image/jpeg" }],
        },
        { submissions: { createPendingWithIntent }, triggerProcessing }
      )
    ).rejects.toThrow("Images must be finalized");
  });
});
