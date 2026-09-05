import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "@/modules/source-document/application/use-cases/create-and-queue-source-document";
import type { InlineImageUploader } from "@/modules/source-document/application/use-cases/prepare-inline-images";

describe("createAndQueueSourceDocument", () => {
  const createPendingWithIntent = vi.fn();
  const createIdempotentPendingWithIntent = vi.fn();
  const scheduleProcessing = vi.fn();
  const createUploadPlan = vi.fn();
  const uploadTarget = vi.fn();
  const finalizeUpload = vi.fn();
  const abandonUploadSession = vi.fn();
  const processImage = vi.fn();
  const storedFiles: InlineImageUploader = {
    createUploadPlan,
    uploadTarget,
    finalizeUpload,
    abandonUploadSession,
  };
  const submissions = { createPendingWithIntent, createIdempotentPendingWithIntent };
  const dependencies = { submissions, storedFiles, processImage, scheduleProcessing };

  beforeEach(() => {
    vi.resetAllMocks();
    createPendingWithIntent.mockResolvedValue({
      document: { id: "doc-1" },
      revision: { id: "revision-1", outcome: "processing" },
      intent: { id: "intent-1" },
    });
    processImage.mockImplementation(async (buffer: Buffer, mimeType: string) => ({
      buffer,
      mimeType,
    }));
  });

  it("rejects empty stored evidence before creating durable state", async () => {
    await expect(
      createAndQueueSourceDocument(
        { ledgerId: "ledger-1", evidence: { kind: "stored", storedFileIds: [] } },
        dependencies
      )
    ).rejects.toThrow(ValidationError);
    expect(createPendingWithIntent).not.toHaveBeenCalled();
  });

  it("creates stored evidence and dispatches after durable intent creation", async () => {
    const result = await createAndQueueSourceDocument(
      {
        ledgerId: "ledger-1",
        evidence: { kind: "stored", text: "Lunch receipt", storedFileIds: ["file-1"] },
        entryDate: "2026-07-15",
      },
      dependencies
    );

    expect(createPendingWithIntent).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      submittedText: "Lunch receipt",
      storedFileIds: ["file-1"],
      entryDate: "2026-07-15",
    });
    expect(scheduleProcessing).toHaveBeenCalledWith({ id: "intent-1" });
    expect(createPendingWithIntent.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleProcessing.mock.invocationCallOrder[0]!
    );
    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      revisionId: "revision-1",
      revisionState: "processing",
    });
  });

  it("uses the required idempotent path and skips preparation on replay", async () => {
    createIdempotentPendingWithIntent.mockResolvedValue({
      document: { id: "doc-1" },
      revision: { id: "revision-1", outcome: "processing" },
      intent: { id: "intent-1" },
      idempotencyReplay: true,
    });
    const idempotency = {
      principalType: "user" as const,
      principalId: "user-1",
      key: "submission-1",
      contentFingerprint: "fingerprint-1",
    };

    await createAndQueueSourceDocument(
      {
        ledgerId: "ledger-1",
        evidence: {
          kind: "inline",
          images: [{ bytes: Buffer.from("image"), mimeType: "image/jpeg", contentHash: "hash" }],
        },
        idempotency,
      },
      dependencies
    );

    expect(createIdempotentPendingWithIntent).toHaveBeenCalledWith(
      idempotency,
      expect.any(Function)
    );
    expect(processImage).not.toHaveBeenCalled();
    expect(createUploadPlan).not.toHaveBeenCalled();
    expect(createPendingWithIntent).not.toHaveBeenCalled();
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });

  it("processes prepared inline images once and submits finalized file identities", async () => {
    createUploadPlan.mockResolvedValue({
      id: "session-1",
      targets: [{ id: "target-1" }],
      finalizationToken: "token-1",
    });
    uploadTarget.mockResolvedValue({ id: "stored-1" });
    finalizeUpload.mockResolvedValue([{ id: "stored-1" }]);
    const bytes = Buffer.from("prepared-image");

    await createAndQueueSourceDocument(
      {
        ledgerId: "ledger-1",
        evidence: {
          kind: "inline",
          images: [{ bytes, mimeType: "image/jpeg", contentHash: "hash" }],
        },
      },
      dependencies
    );

    expect(processImage).toHaveBeenCalledOnce();
    expect(processImage).toHaveBeenCalledWith(bytes, "image/jpeg");
    expect(uploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        uploadSessionId: "session-1",
        targetId: "target-1",
      })
    );
    expect(createPendingWithIntent).toHaveBeenCalledWith(
      expect.objectContaining({ storedFileIds: ["stored-1"] })
    );
  });

  it("abandons finalized upload state when durable submission fails", async () => {
    createUploadPlan.mockResolvedValue({
      id: "session-1",
      targets: [{ id: "target-1" }],
      finalizationToken: "token-1",
    });
    uploadTarget.mockResolvedValue({ id: "stored-1" });
    finalizeUpload.mockResolvedValue([{ id: "stored-1" }]);
    createPendingWithIntent.mockRejectedValue(new Error("write failed"));

    await expect(
      createAndQueueSourceDocument(
        {
          ledgerId: "ledger-1",
          evidence: {
            kind: "inline",
            images: [{ bytes: Buffer.from("image"), mimeType: "image/jpeg", contentHash: "hash" }],
          },
        },
        dependencies
      )
    ).rejects.toThrow("write failed");
    expect(abandonUploadSession).toHaveBeenCalledWith("ledger-1", "session-1");
    expect(scheduleProcessing).not.toHaveBeenCalled();
  });
});
