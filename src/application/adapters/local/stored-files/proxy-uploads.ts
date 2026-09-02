import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { StoredFileContract } from "@/application/contracts";
import { enqueueObjectCleanup } from "@/application/adapters/postgres/object-cleanup";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { MAX_ORIGINAL_BYTES_PER_FILE } from "@/lib/storage/upload-policy";
import { ledgers, storedFiles, uploadSessionFiles, uploadSessions } from "@/persistence";
import { checksum, mapStoredFile } from "./shared";
import { StoredFileUploadPlanAdapter } from "./upload-plans";

export class StoredFileProxyUploadAdapter extends StoredFileUploadPlanAdapter {
  async uploadTargetForUser(input: {
    userId: string;
    uploadSessionId: string;
    targetId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredFileContract> {
    const ownership = await db
      .select({ ledgerId: uploadSessions.ledgerId })
      .from(uploadSessions)
      .innerJoin(ledgers, and(eq(ledgers.id, uploadSessions.ledgerId), isNull(ledgers.deletedAt)))
      .where(and(eq(uploadSessions.id, input.uploadSessionId), eq(ledgers.userId, input.userId)))
      .limit(1);
    const ledgerId = ownership[0]?.ledgerId;
    if (ledgerId == null) throw new NotFoundError("Upload target");
    return this.uploadTarget({ ...input, ledgerId });
  }

  async uploadTarget(input: {
    ledgerId: string;
    uploadSessionId: string;
    targetId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredFileContract> {
    const session = await db.query.uploadSessions.findFirst({
      where: and(
        eq(uploadSessions.ledgerId, input.ledgerId),
        eq(uploadSessions.id, input.uploadSessionId)
      ),
    });
    const now = this.now();
    if (session == null || session.transport !== "proxy" || session.status !== "open") {
      throw new NotFoundError("Upload target");
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      await db
        .update(uploadSessions)
        .set({ status: "expired" })
        .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "open")));
      throw new ConflictError("Upload plan has expired");
    }
    const target = await db.query.uploadSessionFiles.findFirst({
      where: and(
        eq(uploadSessionFiles.ledgerId, input.ledgerId),
        eq(uploadSessionFiles.uploadSessionId, input.uploadSessionId),
        eq(uploadSessionFiles.targetId, input.targetId)
      ),
    });
    if (
      target == null ||
      target.status !== "planned" ||
      target.expectedContentType == null ||
      target.expectedByteSize == null
    ) {
      throw new NotFoundError("Upload target");
    }
    const bytes = Buffer.from(input.body);
    if (
      input.contentType !== target.expectedContentType ||
      bytes.length !== target.expectedByteSize ||
      bytes.length > MAX_ORIGINAL_BYTES_PER_FILE
    ) {
      throw new ValidationError("Uploaded bytes do not match the scoped target");
    }
    const actualChecksum = checksum(bytes);
    if (
      target.expectedChecksum != null &&
      actualChecksum !== target.expectedChecksum.toLowerCase()
    ) {
      throw new ValidationError("Uploaded bytes do not match the expected checksum");
    }

    const storedFileId = crypto.randomUUID();
    const storageKey = `${input.ledgerId}/stored/${storedFileId}`;
    await this.storage.upload(storageKey, bytes, input.contentType);
    try {
      const file = await db.transaction(async (tx) => {
        const insertedFile = await tx
          .insert(storedFiles)
          .values({
            id: storedFileId,
            ledgerId: input.ledgerId,
            storageProvider: "s3",
            storageKey,
            contentType: input.contentType,
            byteSize: bytes.length,
            originalFilename: target.originalFilename,
            checksum: actualChecksum,
            createdAt: now,
          })
          .returning()
          .then((rows) => rows[0]);
        const claimed = await tx
          .update(uploadSessionFiles)
          .set({ storedFileId, status: "uploaded" })
          .where(
            and(
              eq(uploadSessionFiles.ledgerId, input.ledgerId),
              eq(uploadSessionFiles.uploadSessionId, input.uploadSessionId),
              eq(uploadSessionFiles.targetId, input.targetId),
              eq(uploadSessionFiles.status, "planned")
            )
          )
          .returning({ id: uploadSessionFiles.id });
        if (claimed.length === 0) throw new ConflictError("Upload target was already used");
        if (insertedFile == null) throw new ConflictError("Stored file was not created");
        return insertedFile;
      });
      return mapStoredFile(file);
    } catch (error) {
      const cleanup = await this.storage.delete(storageKey);
      if (!cleanup.success) {
        await enqueueObjectCleanup(storageKey);
        logger.error(
          { provider: "s3", storageKey, cleanupError: cleanup.error },
          "Failed to clean up S3 object after database transaction failure"
        );
      }
      throw error;
    }
  }
}
