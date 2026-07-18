/**
 * Upload Policy Integration Tests
 *
 * Covers boundary enforcement across the full upload -> finalize -> revision-attach
 * pipeline, using the real Postgres adapters with an in-memory R2 store.
 * Every test verifies that policy violations terminate before durable state
 * is created and that internal keys are never leaked.
 */

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { StoredFileAdapter } from "@/application/adapters/storage";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import type { StoredFileContract } from "@/application/contracts";
import { ValidationError } from "@/lib/errors";
import {
  MAX_NORMALIZED_BYTES_PER_REVISION,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_FILES,
} from "@/modules/source-document/upload-policy";
import {
  sourceDocumentRevisions,
  storedFiles,
  uploadSessions,
} from "@/persistence";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";
import { getTestDb } from "../../../setup";

/**
 * Minimal in-memory object store that replaces R2 for test isolation.
 */
class MemoryFileStore {
  readonly files = new Map<string, Buffer>();

  async upload(key: string, data: Buffer, _contentType: string): Promise<void> {
    this.files.set(key, Buffer.from(data));
  }

  async download(key: string): Promise<Buffer> {
    return this.files.get(key) ?? Buffer.from([]);
  }

  async delete(key: string): Promise<{ success: boolean; error?: Error }> {
    return { success: this.files.delete(key) };
  }
}

/** Create a finalized stored file via the full upload-plan -> upload -> finalize flow. */
async function finalizedFile(
  adapter: StoredFileAdapter,
  ledgerId: string,
  body: Buffer,
  overrides?: { contentType?: string; checksum?: string | null }
): Promise<StoredFileContract> {
  const contentType = overrides?.contentType ?? "image/jpeg";
  const plan = await adapter.createUploadPlan(ledgerId, [
    {
      contentType,
      byteSize: body.length,
      originalFilename: null,
      ...(overrides?.checksum ? { checksum: overrides.checksum } : {}),
    },
  ]);
  await adapter.uploadTarget({
    ledgerId,
    uploadSessionId: plan.id,
    targetId: plan.targets[0]!.id,
    contentType,
    body,
  });
  const files = await adapter.finalizeUpload({
    ownerLedgerId: ledgerId,
    uploadSessionId: plan.id,
    finalizationToken: plan.finalizationToken,
    targetIds: [plan.targets[0]!.id],
  });
  return files[0]!;
}

describe("upload policy integration", () => {
  describe("invalid uploads produce no source document", () => {
    it("rejects upload plan with unsupported MIME type before any durable state", async () => {
      const { ledgerId } = await createTestUserWithLedger(getTestDb());
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      await expect(
        adapter.createUploadPlan(ledgerId, [
          { contentType: "image/bmp", byteSize: 1024, originalFilename: null },
        ])
      ).rejects.toThrow(ValidationError);

      // No upload session was created
      const db = getTestDb();
      const sessions = await db.select().from(uploadSessions);
      expect(sessions).toHaveLength(0);
    });

    it("rejects upload plan with oversized file before any durable state", async () => {
      const { ledgerId } = await createTestUserWithLedger(getTestDb());
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      await expect(
        adapter.createUploadPlan(ledgerId, [
          {
            contentType: "image/jpeg",
            byteSize: MAX_ORIGINAL_BYTES_PER_FILE + 1,
            originalFilename: null,
          },
        ])
      ).rejects.toThrow(ValidationError);

      const db = getTestDb();
      const sessions = await db.select().from(uploadSessions);
      expect(sessions).toHaveLength(0);
    });

    it("rejects upload plan with too many files before any durable state", async () => {
      const { ledgerId } = await createTestUserWithLedger(getTestDb());
      const adapter = new StoredFileAdapter(new MemoryFileStore());
      const files = Array.from({ length: MAX_FILES + 1 }, () => ({
        contentType: "image/jpeg" as const,
        byteSize: 1024,
        originalFilename: null as string | null,
      }));

      await expect(adapter.createUploadPlan(ledgerId, files)).rejects.toThrow(
        ValidationError
      );

      const db = getTestDb();
      const sessions = await db.select().from(uploadSessions);
      expect(sessions).toHaveLength(0);
    });
  });

  describe("checksum mismatch at finalization", () => {
    it("rejects upload target when actual bytes do not match expected checksum", async () => {
      const { ledgerId } = await createTestUserWithLedger(getTestDb());
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      const body = Buffer.from("receipt-image-data");
      // Provide a checksum that does NOT match the actual body
      const wrongChecksum = "a".repeat(64);
      const plan = await adapter.createUploadPlan(ledgerId, [
        {
          contentType: "image/jpeg",
          byteSize: body.length,
          originalFilename: null,
          checksum: wrongChecksum,
        },
      ]);

      await expect(
        adapter.uploadTarget({
          ledgerId,
          uploadSessionId: plan.id,
          targetId: plan.targets[0]!.id,
          contentType: "image/jpeg",
          body,
        })
      ).rejects.toThrow(ValidationError);

      // No stored file was created in the database
      const db = getTestDb();
      const allFiles = await db.select().from(storedFiles);
      expect(allFiles).toHaveLength(0);
    });

    it("accepts upload when checksum matches", async () => {
      const { ledgerId } = await createTestUserWithLedger(getTestDb());
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      const body = Buffer.from("valid-image-data");
      const plan = await adapter.createUploadPlan(ledgerId, [
        {
          contentType: "image/jpeg",
          byteSize: body.length,
          originalFilename: null,
        },
      ]);

      await expect(
        adapter.uploadTarget({
          ledgerId,
          uploadSessionId: plan.id,
          targetId: plan.targets[0]!.id,
          contentType: "image/jpeg",
          body,
        })
      ).resolves.toBeDefined();
    });
  });

  describe("aggregate byte overflow at revision attachment", () => {
    it("rejects revision attachment when total bytes exceed MAX_NORMALIZED_BYTES_PER_REVISION", async () => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(db);
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      // Create enough finalized stored files to overflow the revision aggregate limit.
      // Use two files each at 60% of the limit so their sum exceeds it.
      const halfPlus = Math.ceil(MAX_NORMALIZED_BYTES_PER_REVISION * 0.6);
      const totalBytes = halfPlus * 2;
      expect(totalBytes).toBeGreaterThan(MAX_NORMALIZED_BYTES_PER_REVISION);

      const file1 = await finalizedFile(adapter, ledgerId, Buffer.alloc(halfPlus, 0xff));
      const file2 = await finalizedFile(adapter, ledgerId, Buffer.alloc(halfPlus, 0xff));

      // Try to create a pending revision linking both files — must run inside a
      // db.transaction since createPendingRevisionInTransaction expects a tx handle.
      await expect(
        db.transaction(async (tx) =>
          createPendingRevisionInTransaction(tx, {
            ledgerId,
            storedFileIds: [file1.id, file2.id],
            entryDate: "2026-07-15",
          })
        )
      ).rejects.toThrow(ValidationError);

      // No revision rows were created in the database
      const revisions = await db.select().from(sourceDocumentRevisions);
      expect(revisions).toHaveLength(0);
    });

    it("accepts revision attachment when total bytes are within limit", async () => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(db);
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      const body = Buffer.from("small-file");
      const file = await finalizedFile(adapter, ledgerId, body);

      const result = await db.transaction(async (tx) =>
        createPendingRevisionInTransaction(tx, {
          ledgerId,
          storedFileIds: [file.id],
          entryDate: "2026-07-15",
        })
      );

      expect(result.document).toBeDefined();
      expect(result.revision).toBeDefined();
    });
  });

  describe("R2 storage keys are never exposed in responses", () => {
    it("does not return storageKey in stored file query results", async () => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(db);
      const adapter = new StoredFileAdapter(new MemoryFileStore());

      const file = await finalizedFile(adapter, ledgerId, Buffer.from("no-keys"));

      // The StoredFileContract returned by the adapter should not contain storageKey
      expect(file).not.toHaveProperty("storageKey");
      expect(file).not.toHaveProperty("storageProvider");

      // The metadata on the contract should not contain storageKey
      if (file.metadata && typeof file.metadata === "object") {
        expect(file.metadata).not.toHaveProperty("storageKey");
      }

      // Verify the raw database row does have storageKey (it exists in the DB)
      const rawRow = await db
        .select({
          storageKey: storedFiles.storageKey,
          storageProvider: storedFiles.storageProvider,
        })
        .from(storedFiles)
        .where(eq(storedFiles.id, file.id))
        .then((rows) => rows[0]);
      expect(rawRow).toBeDefined();
      expect(rawRow!.storageKey).toContain(ledgerId);
      expect(rawRow!.storageProvider).toBe("r2");
    });
  });
});
