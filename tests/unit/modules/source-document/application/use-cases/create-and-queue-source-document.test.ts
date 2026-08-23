import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/errors";
import { MAX_ORIGINAL_BYTES_PER_FILE } from "@/lib/storage/upload-policy";
import { createAndQueueSourceDocument } from "@/modules/source-document/application/use-cases/create-and-queue-source-document";
import type { InlineImageUploader } from "@/modules/source-document/application/use-cases/prepare-inline-images";

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
  const scheduleProcessing = vi.fn();

  // Inline image uploader mocks
  const createUploadPlan = vi.fn();
  const uploadTarget = vi.fn();
  const finalizeUpload = vi.fn();
  const abandonUploadSession = vi.fn();
  const processImage = vi.fn();

  const mockStoredFiles: InlineImageUploader = {
    createUploadPlan,
    uploadTarget,
    finalizeUpload,
    abandonUploadSession,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    createPendingWithIntent.mockResolvedValue({
      document: { id: "doc-1" },
      revision: { id: "revision-1" },
      intent: { id: "intent-1" },
    });
    processImage.mockImplementation(async (buffer: Buffer, mimeType: string) => ({
      buffer,
      mimeType,
    }));
  });

  it("rejects an empty submission before creating durable state", async () => {
    await expect(
      createAndQueueSourceDocument(
        { ledgerId: ledger.id, ledger },
        {
          submissions: { createPendingWithIntent },
          storedFiles: mockStoredFiles,
          processImage,
          scheduleProcessing,
        }
      )
    ).rejects.toThrow(ValidationError);
    expect(createPendingWithIntent).not.toHaveBeenCalled();
  });

  it("creates text evidence and durable intent before triggering dispatch", async () => {
    const result = await createAndQueueSourceDocument(
      { ledgerId: ledger.id, ledger, text: "Lunch receipt", entryDate: "2026-07-15" },
      {
        submissions: { createPendingWithIntent },
        storedFiles: mockStoredFiles,
        processImage,
        scheduleProcessing,
      }
    );

    expect(createPendingWithIntent).toHaveBeenCalledWith({
      ledgerId: ledger.id,
      submittedText: "Lunch receipt",
      storedFileIds: [],
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

  it("submits finalized stored-file identities without raw image material", async () => {
    await createAndQueueSourceDocument(
      {
        ledgerId: ledger.id,
        ledger,
        text: "Mixed receipt",
        storedFileIds: ["00000000-0000-4000-8000-000000000001"],
      },
      {
        submissions: { createPendingWithIntent },
        storedFiles: mockStoredFiles,
        processImage,
        scheduleProcessing,
      }
    );
    expect(createPendingWithIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedText: "Mixed receipt",
        storedFileIds: ["00000000-0000-4000-8000-000000000001"],
      })
    );
  });

  describe("inline image processing", () => {
    it("decodes raw base64, uploads and finalizes, and passes the stored-file IDs to createPendingWithIntent", async () => {
      const uploadPlan = {
        id: "session-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: [
          { id: "target-1", method: "PUT" as const, url: "/upload/target-1", requiredHeaders: {} },
        ],
        finalizationToken: "token-1",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      };
      createUploadPlan.mockResolvedValue(uploadPlan);
      uploadTarget.mockResolvedValue({
        id: "stored-1",
        ownerLedgerId: ledger.id,
        metadata: {
          contentType: "image/jpeg",
          byteSize: 100,
          originalFilename: null,
          checksum: null,
        },
        createdAt: new Date().toISOString(),
      });
      finalizeUpload.mockResolvedValue([
        {
          id: "stored-1",
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);

      await createAndQueueSourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          text: "With inline image",
          images: [
            { data: Buffer.from("fake-jpeg-bytes").toString("base64"), mimeType: "image/jpeg" },
          ],
        },
        {
          submissions: { createPendingWithIntent },
          storedFiles: mockStoredFiles,
          processImage,
          scheduleProcessing,
        }
      );

      // Upload plan was created with correct metadata
      expect(createUploadPlan).toHaveBeenCalledWith(
        ledger.id,
        expect.arrayContaining([
          expect.objectContaining({
            contentType: "image/jpeg",
            byteSize: expect.any(Number),
            originalFilename: null,
          }),
        ])
      );
      // uploadTarget was called with the target
      expect(uploadTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          ledgerId: ledger.id,
          uploadSessionId: "session-1",
          targetId: "target-1",
          contentType: "image/jpeg",
        })
      );
      // finalize upload was called
      expect(finalizeUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadSessionId: "session-1",
          targetIds: ["target-1"],
        })
      );
      // createPendingWithIntent received the finalized file ID
      expect(createPendingWithIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          storedFileIds: ["stored-1"],
        })
      );
    });

    it("processes data URL images, uploads and finalizes them", async () => {
      const uploadPlan = {
        id: "session-2",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: [
          { id: "target-2", method: "PUT" as const, url: "/upload/target-2", requiredHeaders: {} },
        ],
        finalizationToken: "token-2",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      };
      createUploadPlan.mockResolvedValue(uploadPlan);
      uploadTarget.mockResolvedValue({
        id: "stored-2",
        ownerLedgerId: ledger.id,
        metadata: {
          contentType: "image/png",
          byteSize: 50,
          originalFilename: null,
          checksum: null,
        },
        createdAt: new Date().toISOString(),
      });
      finalizeUpload.mockResolvedValue([
        {
          id: "stored-2",
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/png",
            byteSize: 50,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);

      await createAndQueueSourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          text: "With data URL image",
          images: [{ data: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/png" }],
        },
        {
          submissions: { createPendingWithIntent },
          storedFiles: mockStoredFiles,
          processImage,
          scheduleProcessing,
        }
      );

      expect(uploadTarget).toHaveBeenCalled();
      expect(finalizeUpload).toHaveBeenCalled();
      expect(createPendingWithIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          storedFileIds: ["stored-2"],
        })
      );
    });

    it("combines existing storedFileIds with processed images in correct order", async () => {
      const existingFileId = "00000000-0000-4000-8000-000000000001";
      const uploadPlan = {
        id: "session-3",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: [
          { id: "target-img-1", method: "PUT" as const, url: "/upload/img-1", requiredHeaders: {} },
        ],
        finalizationToken: "token-3",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      };
      createUploadPlan.mockResolvedValueOnce({
        ...uploadPlan,
        id: "session-img",
        targets: [
          { id: "target-img-1", method: "PUT" as const, url: "/upload/img-1", requiredHeaders: {} },
        ],
        finalizationToken: "token-img",
      });
      uploadTarget.mockResolvedValueOnce({
        id: "stored-img-1",
        ownerLedgerId: ledger.id,
        metadata: {
          contentType: "image/jpeg",
          byteSize: 100,
          originalFilename: null,
          checksum: null,
        },
        createdAt: new Date().toISOString(),
      });
      finalizeUpload.mockResolvedValueOnce([
        {
          id: "stored-img-1",
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);

      await createAndQueueSourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          text: "Mixed",
          storedFileIds: [existingFileId],
          images: [{ data: Buffer.from("img-data").toString("base64"), mimeType: "image/jpeg" }],
        },
        {
          submissions: { createPendingWithIntent },
          storedFiles: mockStoredFiles,
          processImage,
          scheduleProcessing,
        }
      );

      expect(createPendingWithIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          storedFileIds: ["00000000-0000-4000-8000-000000000001", "stored-img-1"],
        })
      );
    });

    it("rejects originalImages before creating any upload plan or durable state", async () => {
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "With original images",
            images: [{ data: Buffer.from("img-data").toString("base64"), mimeType: "image/jpeg" }],
            originalImages: [
              { data: Buffer.from("oi-data").toString("base64"), mimeType: "image/jpeg" },
            ],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("rejects decoded image data exceeding MAX_ORIGINAL_BYTES_PER_FILE before creating any upload plan or durable state", async () => {
      const oversizedBase64 = Buffer.alloc(MAX_ORIGINAL_BYTES_PER_FILE + 1, "a").toString("base64");
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Oversized image",
            images: [{ data: oversizedBase64, mimeType: "image/jpeg" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("passes no raw image data to createPendingWithIntent", async () => {
      createUploadPlan.mockResolvedValue({
        id: "session-noraw",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: [
          { id: "target-noraw", method: "PUT" as const, url: "/upload/noraw", requiredHeaders: {} },
        ],
        finalizationToken: "token-noraw",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      });
      uploadTarget.mockResolvedValue({
        id: "stored-noraw",
        ownerLedgerId: ledger.id,
        metadata: {
          contentType: "image/jpeg",
          byteSize: 100,
          originalFilename: null,
          checksum: null,
        },
        createdAt: new Date().toISOString(),
      });
      finalizeUpload.mockResolvedValue([
        {
          id: "stored-noraw",
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);

      await createAndQueueSourceDocument(
        {
          ledgerId: ledger.id,
          ledger,
          text: "No raw data",
          images: [{ data: Buffer.from("no-raw").toString("base64"), mimeType: "image/jpeg" }],
        },
        {
          submissions: { createPendingWithIntent },
          storedFiles: mockStoredFiles,
          processImage,
          scheduleProcessing,
        }
      );

      // The storedFileIds should only contain the finalized file ID, not any raw image data
      const callArgs = createPendingWithIntent.mock.calls[0]![0]!;
      expect(callArgs.storedFileIds).toEqual(["stored-noraw"]);
      // No raw image keys leaked into submission
      expect(Object.keys(callArgs)).not.toContain("images");
      expect(Object.keys(callArgs)).not.toContain("originalImages");
    });

    it("rejects invalid base64 before creating any upload plan or durable state", async () => {
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Bad base64",
            images: [{ data: "!!!not-base64!!!", mimeType: "image/jpeg" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("rejects data URL MIME mismatch before creating any upload plan", async () => {
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "MIME mismatch",
            images: [{ data: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/jpeg" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("rejects empty decoded data before creating any upload plan", async () => {
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Empty data",
            images: [{ data: "", mimeType: "image/jpeg" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("accepts base64 with whitespace and newlines, stripping them before decode validation", async () => {
      const uploadPlan = {
        id: "session-whitespace",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: [
          { id: "target-ws", method: "PUT" as const, url: "/upload/ws", requiredHeaders: {} },
        ],
        finalizationToken: "token-ws",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      };
      createUploadPlan.mockResolvedValue(uploadPlan);
      uploadTarget.mockResolvedValue({
        id: "stored-ws",
        ownerLedgerId: ledger.id,
        metadata: {
          contentType: "image/jpeg",
          byteSize: 100,
          originalFilename: null,
          checksum: null,
        },
        createdAt: new Date().toISOString(),
      });
      finalizeUpload.mockResolvedValue([
        {
          id: "stored-ws",
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);

      // Base64 with embedded newlines as produced by e.g. base64 -w 76
      const base64WithNewlines = Buffer.from("test-image-data")
        .toString("base64")
        .replace(/.{8}/g, "$&\n");
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Whitespace base64",
            images: [{ data: base64WithNewlines, mimeType: "image/jpeg" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).resolves.not.toThrow();
      expect(createUploadPlan).toHaveBeenCalled();
    });

    it("rejects combined storedFileIds + images exceeding MAX_FILES before creating durable state", async () => {
      // 6 stored files + 5 inline images = 11, exceeds MAX_FILES=10
      const uploadPlan = {
        id: "session-overflow",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targets: Array.from({ length: 5 }, (_, i) => ({
          id: `target-${i}`,
          method: "PUT" as const,
          url: `/upload/target-${i}`,
          requiredHeaders: {} as Record<string, string>,
        })),
        finalizationToken: "token-overflow",
        maxFiles: 10,
        maxBytesPerFile: 10 * 1024 * 1024,
      };
      createUploadPlan.mockResolvedValue(uploadPlan);
      for (let i = 0; i < 5; i++) {
        uploadTarget.mockResolvedValueOnce({
          id: `stored-${i}`,
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        });
      }
      finalizeUpload.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `stored-${i}`,
          ownerLedgerId: ledger.id,
          metadata: {
            contentType: "image/jpeg",
            byteSize: 100,
            originalFilename: null,
            checksum: null,
          },
          createdAt: new Date().toISOString(),
        }))
      );

      // 6 existing stored-file IDs
      const existingIds = Array.from(
        { length: 6 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
      );

      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Overflow test",
            storedFileIds: existingIds,
            images: Array.from({ length: 5 }, () => ({
              data: Buffer.from("img-data").toString("base64"),
              mimeType: "image/jpeg",
            })),
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);

      // createPendingWithIntent should not have been called
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });

    it("rejects unsupported MIME type in payload validation", async () => {
      await expect(
        createAndQueueSourceDocument(
          {
            ledgerId: ledger.id,
            ledger,
            text: "Unsupported MIME",
            images: [{ data: "dGVzdA==", mimeType: "image/tiff" }],
          },
          {
            submissions: { createPendingWithIntent },
            storedFiles: mockStoredFiles,
            processImage,
            scheduleProcessing,
          }
        )
      ).rejects.toThrow(ValidationError);
      expect(createUploadPlan).not.toHaveBeenCalled();
      expect(createPendingWithIntent).not.toHaveBeenCalled();
    });
  });
});
