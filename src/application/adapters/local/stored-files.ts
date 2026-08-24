import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type {
  AuthorizedFileReadContract,
  DirectStoredFilePort,
  LedgerId,
  StoredFileContract,
  StoredFileId,
  UploadFileRequestContract,
  UploadFinalizationContract,
  UploadPlanContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getS3Storage } from "@/lib/storage/s3";
import type { ObjectStore } from "@/lib/storage";
import { ledgers, storedFiles, uploadSessionFiles, uploadSessions } from "@/persistence";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_NORMALIZED_BYTES_PER_REVISION,
  DIRECT_UPLOAD_FINALIZE_BUFFER_MS,
  SUPPORTED_MIME_SET,
  UPLOAD_SESSION_EXPIRY_MS,
} from "@/lib/storage/upload-policy";
import { enqueueObjectCleanup } from "@/application/adapters/postgres/object-cleanup";
import { processImage, validateStoredImageBytes } from "@/lib/storage/image-processing";
import {
  postgresAuthorizedFileRepository,
  type AuthorizedFileRepository,
} from "@/application/adapters/postgres/authorized-files";
import {
  postgresUploadSessionRepository,
  type UploadSessionRepository,
} from "@/application/adapters/postgres/upload-sessions";

type DirectObjectFileStore = Required<Pick<ObjectStore, "presignUpload" | "head">> & ObjectStore;

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function checksum(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function mapStoredFile(row: typeof storedFiles.$inferSelect): StoredFileContract {
  return {
    id: row.id,
    ownerLedgerId: row.ledgerId,
    metadata: {
      contentType: row.contentType,
      byteSize: row.byteSize,
      originalFilename: row.originalFilename,
      checksum: row.checksum,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

function validateRequests(files: readonly UploadFileRequestContract[]): void {
  if (files.length === 0 || files.length > MAX_FILES) {
    throw new ValidationError(`Upload plans require 1-${MAX_FILES} files`);
  }
  for (const file of files) {
    if (!SUPPORTED_MIME_SET.has(file.contentType)) {
      throw new ValidationError("Unsupported upload content type");
    }
    if (
      !Number.isInteger(file.byteSize) ||
      file.byteSize <= 0 ||
      file.byteSize > MAX_ORIGINAL_BYTES_PER_FILE
    ) {
      throw new ValidationError("Upload file size exceeds the configured limit");
    }
    if ((file.originalFilename?.length ?? 0) > 255) {
      throw new ValidationError("Upload filename is too long");
    }
    if (file.checksum != null && !/^[a-f\d]{64}$/i.test(file.checksum)) {
      throw new ValidationError("Upload checksum must be a SHA-256 hex digest");
    }
  }
}

function requireDirectStorage(storage: ObjectStore): DirectObjectFileStore {
  if (storage.presignUpload == null || storage.head == null) {
    throw new AppError("Direct upload storage is not configured", "STORAGE_UNAVAILABLE", 503);
  }
  return storage as DirectObjectFileStore;
}

function temporaryKey(ledgerId: string, sessionId: string, targetId: string): string {
  return `temporary/${ledgerId}/${sessionId}/${targetId}`;
}

function durableKey(ledgerId: string, storedFileId: string): string {
  return `${ledgerId}/stored/${storedFileId}`;
}

export class StoredFileAdapter implements DirectStoredFilePort {
  constructor(
    private readonly storage: ObjectStore = getS3Storage(),
    private readonly now: () => Date = () => new Date(),
    private readonly authorizedFiles: AuthorizedFileRepository = postgresAuthorizedFileRepository,
    private readonly uploadSessionRepository: UploadSessionRepository = postgresUploadSessionRepository
  ) {}

  async createUploadPlan(
    ledgerId: LedgerId,
    files: readonly UploadFileRequestContract[] = []
  ): Promise<UploadPlanContract> {
    validateRequests(files);
    const sessionId = crypto.randomUUID();
    const finalizationToken = crypto.randomBytes(32).toString("base64url");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + UPLOAD_SESSION_EXPIRY_MS);
    const targetIds = files.map(() => crypto.randomUUID());

    await this.uploadSessionRepository.create({
      id: sessionId,
      ledgerId,
      finalizationTokenHash: tokenHash(finalizationToken),
      transport: "proxy",
      expiresAt,
      createdAt: now,
      targets: files.map((file, position) => ({
        id: targetIds[position]!,
        position,
        contentType: file.contentType,
        byteSize: file.byteSize,
        originalFilename: file.originalFilename,
        checksum: file.checksum ?? null,
      })),
    });

    return {
      id: sessionId,
      expiresAt: expiresAt.toISOString(),
      targets: files.map((file, position) => ({
        id: targetIds[position]!,
        method: "PUT" as const,
        url: `/api/stored-files/upload-targets/${sessionId}/${targetIds[position]!}`,
        requiredHeaders: { "Content-Type": file.contentType },
      })),
      finalizationToken,
      maxFiles: MAX_FILES,
      maxBytesPerFile: MAX_ORIGINAL_BYTES_PER_FILE,
    };
  }

  async createDirectUploadPlan(
    ledgerId: LedgerId,
    files: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract> {
    validateRequests(files);
    if (files.some((file) => file.checksum == null || !/^[a-f\d]{64}$/.test(file.checksum))) {
      throw new ValidationError("Direct uploads require a lowercase SHA-256 checksum");
    }
    if (
      files.reduce((total, file) => total + file.byteSize, 0) > MAX_NORMALIZED_BYTES_PER_REVISION
    ) {
      throw new ValidationError("Direct upload batch exceeds the configured total byte limit");
    }

    const storage = requireDirectStorage(this.storage);
    const sessionId = crypto.randomUUID();
    const finalizationToken = crypto.randomBytes(32).toString("base64url");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + UPLOAD_SESSION_EXPIRY_MS);
    const targetIds = files.map(() => crypto.randomUUID());

    await this.uploadSessionRepository.create({
      id: sessionId,
      ledgerId,
      finalizationTokenHash: tokenHash(finalizationToken),
      transport: "direct",
      expiresAt,
      createdAt: now,
      targets: files.map((file, position) => ({
        id: targetIds[position]!,
        position,
        contentType: file.contentType,
        byteSize: file.byteSize,
        originalFilename: file.originalFilename,
        checksum: file.checksum!.toLowerCase(),
      })),
    });

    try {
      const targets = await Promise.all(
        files.map(async (file, position) => {
          const targetId = targetIds[position]!;
          const signed = await storage.presignUpload(
            temporaryKey(ledgerId, sessionId, targetId),
            file.contentType,
            file.checksum!,
            Math.floor((UPLOAD_SESSION_EXPIRY_MS - DIRECT_UPLOAD_FINALIZE_BUFFER_MS) / 1000)
          );
          return { id: targetId, method: "PUT" as const, ...signed };
        })
      );
      return {
        id: sessionId,
        expiresAt: expiresAt.toISOString(),
        targets,
        finalizationToken,
        maxFiles: MAX_FILES,
        maxBytesPerFile: MAX_ORIGINAL_BYTES_PER_FILE,
      };
    } catch (error) {
      await db
        .update(uploadSessions)
        .set({ status: "cancelled" })
        .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.status, "open")));
      throw error;
    }
  }

  async abandonUploadSession(ledgerId: LedgerId, uploadSessionId: string): Promise<void> {
    const targets = await db.transaction(async (tx) => {
      const cancelled = await tx
        .update(uploadSessions)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(uploadSessions.id, uploadSessionId),
            eq(uploadSessions.ledgerId, ledgerId),
            inArray(uploadSessions.status, ["open", "finalizing", "finalized"])
          )
        )
        .returning({ id: uploadSessions.id });
      if (cancelled.length === 0) return [];
      return tx
        .select({ targetId: uploadSessionFiles.targetId })
        .from(uploadSessionFiles)
        .where(
          and(
            eq(uploadSessionFiles.ledgerId, ledgerId),
            eq(uploadSessionFiles.uploadSessionId, uploadSessionId)
          )
        );
    });
    await Promise.all(
      targets.map((target) =>
        enqueueObjectCleanup(
          temporaryKey(ledgerId, uploadSessionId, target.targetId),
          uploadSessionId
        )
      )
    );
  }

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

  async finalizeDirectUpload(
    input: UploadFinalizationContract
  ): Promise<readonly StoredFileContract[]> {
    const storage = requireDirectStorage(this.storage);
    let session = await db.query.uploadSessions.findFirst({
      where: eq(uploadSessions.id, input.uploadSessionId),
    });
    if (
      session == null ||
      session.transport !== "direct" ||
      (input.ownerLedgerId != null && session.ledgerId !== input.ownerLedgerId) ||
      !safeTokenMatches(input.finalizationToken, session.finalizationTokenHash)
    ) {
      throw new NotFoundError("Upload session");
    }

    const targets = await db
      .select()
      .from(uploadSessionFiles)
      .where(
        and(
          eq(uploadSessionFiles.ledgerId, session.ledgerId),
          eq(uploadSessionFiles.uploadSessionId, session.id)
        )
      )
      .orderBy(asc(uploadSessionFiles.position));
    if (
      targets.length === 0 ||
      targets.length !== input.targetIds.length ||
      targets.some((target, position) => target.targetId !== input.targetIds[position])
    ) {
      throw new ValidationError("Upload targets must be complete and in planned order");
    }
    if (
      targets.some(
        (target) =>
          target.expectedContentType == null ||
          target.expectedByteSize == null ||
          target.expectedChecksum == null
      )
    ) {
      throw new ConflictError("Direct upload targets are incomplete");
    }

    const now = this.now();
    const activeSession = session;
    if (session.status === "open") {
      if (session.expiresAt.getTime() <= now.getTime()) {
        await db
          .update(uploadSessions)
          .set({ status: "expired" })
          .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "open")));
        await Promise.all(
          targets.map((target) =>
            enqueueObjectCleanup(
              temporaryKey(activeSession.ledgerId, activeSession.id, target.targetId),
              activeSession.id
            )
          )
        );
        throw new ConflictError("Upload plan has expired");
      }
      await db
        .update(uploadSessions)
        .set({ status: "finalizing" })
        .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "open")));
      session =
        (await db.query.uploadSessions.findFirst({
          where: eq(uploadSessions.id, session.id),
        })) ?? session;
    }
    if (session.status === "finalized") {
      return this.finalizeUpload(input);
    }
    if (session.status !== "finalizing") {
      throw new ConflictError("Upload session cannot be finalized");
    }

    let inspected: Array<{
      bytes: Buffer;
      contentType: string;
      checksum: string;
    }>;
    try {
      const uploaded = await Promise.all(
        targets.map(async (target) => {
          const key = temporaryKey(session.ledgerId, session.id, target.targetId);
          const [metadata, bytes] = await Promise.all([storage.head(key), storage.download(key)]);
          return { metadata, bytes, checksum: checksum(bytes) };
        })
      );
      for (const [position, target] of targets.entries()) {
        const actual = uploaded[position]!;
        if (
          actual.metadata.byteSize !== target.expectedByteSize ||
          actual.bytes.length !== target.expectedByteSize ||
          actual.metadata.contentType !== target.expectedContentType ||
          actual.checksum !== target.expectedChecksum
        ) {
          throw new ConflictError("Uploaded object does not match the upload plan");
        }
      }
      inspected = await Promise.all(
        uploaded.map(async (actual, position) => {
          const processed = await processImage(
            actual.bytes,
            targets[position]!.expectedContentType!
          );
          await validateStoredImageBytes(processed.buffer, processed.mimeType);
          return {
            bytes: processed.buffer,
            contentType: processed.mimeType,
            checksum: checksum(processed.buffer),
          };
        })
      );
      const normalizedTotalBytes = inspected.reduce((sum, file) => sum + file.bytes.length, 0);
      if (normalizedTotalBytes > MAX_NORMALIZED_BYTES_PER_REVISION) {
        throw new ValidationError(
          `Total stored bytes ${normalizedTotalBytes} exceeds revision limit of ${MAX_NORMALIZED_BYTES_PER_REVISION}`
        );
      }
    } catch (error) {
      if (error instanceof ConflictError) {
        await db.transaction(async (tx) => {
          await tx
            .update(uploadSessionFiles)
            .set({ status: "rejected" })
            .where(
              and(
                eq(uploadSessionFiles.uploadSessionId, session.id),
                eq(uploadSessionFiles.status, "planned")
              )
            );
          await tx
            .update(uploadSessions)
            .set({ status: "cancelled" })
            .where(eq(uploadSessions.id, session.id));
        });
        await Promise.all(
          targets.map((target) =>
            enqueueObjectCleanup(
              temporaryKey(session.ledgerId, session.id, target.targetId),
              session.id
            )
          )
        );
      } else {
        await db
          .update(uploadSessions)
          .set({ status: "open" })
          .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "finalizing")));
      }
      throw error;
    }

    await Promise.all(
      targets.map(async (target) => {
        if (target.status === "uploaded" || target.status === "finalized") return;
        const storedFileId = target.targetId;
        const storageKey = durableKey(session.ledgerId, storedFileId);
        const normalized = inspected[target.position]!;
        await storage.upload(storageKey, normalized.bytes, normalized.contentType);
        try {
          await db.transaction(async (tx) => {
            await tx
              .insert(storedFiles)
              .values({
                id: storedFileId,
                ledgerId: session.ledgerId,
                storageProvider: "s3",
                storageKey,
                contentType: normalized.contentType,
                byteSize: normalized.bytes.length,
                originalFilename: target.originalFilename,
                checksum: normalized.checksum,
                createdAt: now,
              })
              .onConflictDoNothing();
            const file = await tx.query.storedFiles.findFirst({
              where: and(
                eq(storedFiles.ledgerId, session.ledgerId),
                eq(storedFiles.id, storedFileId)
              ),
            });
            if (
              file == null ||
              file.storageKey !== storageKey ||
              file.contentType !== normalized.contentType ||
              file.byteSize !== normalized.bytes.length ||
              file.checksum !== normalized.checksum
            ) {
              throw new ConflictError("Stored file promotion conflicted with existing state");
            }
            await tx
              .update(uploadSessionFiles)
              .set({ storedFileId, status: "uploaded" })
              .where(
                and(
                  eq(uploadSessionFiles.ledgerId, session.ledgerId),
                  eq(uploadSessionFiles.uploadSessionId, session.id),
                  eq(uploadSessionFiles.targetId, target.targetId),
                  eq(uploadSessionFiles.status, "planned")
                )
              );
          });
        } catch (error) {
          const cleanup = await storage.delete(storageKey);
          if (!cleanup.success) await enqueueObjectCleanup(storageKey, session.id);
          throw error;
        }
      })
    );

    const files = await this.finalizeUpload(input);
    const cleanupResults = await Promise.all(
      targets.map((target) =>
        storage.delete(temporaryKey(session.ledgerId, session.id, target.targetId))
      )
    );
    if (cleanupResults.some((result) => !result.success)) {
      await Promise.all(
        cleanupResults.flatMap((result, position) =>
          result.success
            ? []
            : [
                enqueueObjectCleanup(
                  temporaryKey(session.ledgerId, session.id, targets[position]!.targetId),
                  session.id
                ),
              ]
        )
      );
      logger.warn({ uploadSessionId: session.id }, "Temporary S3 upload cleanup was incomplete");
    }
    return files;
  }

  async finalizeBrowserUpload(
    input: UploadFinalizationContract
  ): Promise<readonly StoredFileContract[]> {
    const session = await db.query.uploadSessions.findFirst({
      where: eq(uploadSessions.id, input.uploadSessionId),
    });
    if (session?.transport === "direct") return this.finalizeDirectUpload(input);
    return this.finalizeUpload(input);
  }

  async finalizeUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]> {
    const session = await db.query.uploadSessions.findFirst({
      where: eq(uploadSessions.id, input.uploadSessionId),
    });
    if (
      session == null ||
      (input.ownerLedgerId != null && session.ledgerId !== input.ownerLedgerId) ||
      !safeTokenMatches(input.finalizationToken, session.finalizationTokenHash)
    ) {
      throw new NotFoundError("Upload session");
    }
    const targetIds = [...new Set(input.targetIds)];
    if (targetIds.length === 0 || targetIds.length !== input.targetIds.length) {
      throw new ValidationError("Finalization requires unique upload targets");
    }
    if (session.transport === "direct") {
      const plannedTargets = await db
        .select({ targetId: uploadSessionFiles.targetId })
        .from(uploadSessionFiles)
        .where(
          and(
            eq(uploadSessionFiles.ledgerId, session.ledgerId),
            eq(uploadSessionFiles.uploadSessionId, session.id)
          )
        )
        .orderBy(asc(uploadSessionFiles.position));
      if (
        plannedTargets.length !== input.targetIds.length ||
        plannedTargets.some((target, position) => target.targetId !== input.targetIds[position])
      ) {
        throw new ValidationError("Upload targets must be complete and in planned order");
      }
    }
    const now = this.now();
    if (session.expiresAt.getTime() <= now.getTime() && session.status === "open") {
      await db
        .update(uploadSessions)
        .set({ status: "expired" })
        .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "open")));
      throw new ConflictError("Upload plan has expired");
    }

    const { files, targets } = await db.transaction(async (tx) => {
      const lockedSession = await tx
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, input.uploadSessionId))
        .for("update")
        .then((rows) => rows[0]);
      if (
        lockedSession == null ||
        lockedSession.ledgerId !== session.ledgerId ||
        (input.ownerLedgerId != null && lockedSession.ledgerId !== input.ownerLedgerId) ||
        !safeTokenMatches(input.finalizationToken, lockedSession.finalizationTokenHash)
      ) {
        throw new NotFoundError("Upload session");
      }
      if (
        lockedSession.status !== "open" &&
        lockedSession.status !== "finalizing" &&
        lockedSession.status !== "finalized"
      ) {
        throw new ConflictError("Upload session cannot be finalized");
      }
      const targets = await tx
        .select()
        .from(uploadSessionFiles)
        .where(
          and(
            eq(uploadSessionFiles.ledgerId, session.ledgerId),
            eq(uploadSessionFiles.uploadSessionId, session.id),
            inArray(uploadSessionFiles.targetId, targetIds)
          )
        )
        .orderBy(asc(uploadSessionFiles.position));
      if (
        targets.length !== targetIds.length ||
        targets.some(
          (target) =>
            target.storedFileId == null ||
            (target.status !== "uploaded" && target.status !== "finalized")
        )
      ) {
        throw new ConflictError("Upload targets are incomplete");
      }
      // Validate unique display order: deduplicate on position since targets are unique
      const positionSet = new Set(targets.map((t) => t.position));
      if (positionSet.size !== targets.length) {
        throw new ValidationError("Upload targets have duplicate display positions");
      }
      const storedFileIds = targets.map((target) => target.storedFileId!);
      // Enforce total normalized bytes per revision
      const files = await tx
        .select()
        .from(storedFiles)
        .where(
          and(eq(storedFiles.ledgerId, session.ledgerId), inArray(storedFiles.id, storedFileIds))
        );
      const totalBytes = files.reduce((sum, f) => sum + f.byteSize, 0);
      if (totalBytes > MAX_NORMALIZED_BYTES_PER_REVISION) {
        throw new ValidationError(
          `Total stored bytes ${totalBytes} exceeds revision limit of ${MAX_NORMALIZED_BYTES_PER_REVISION}`
        );
      }
      const bytesByStoredFileId = new Map(files.map((file) => [file.id, file.byteSize]));
      await Promise.all(
        targets.map((target) =>
          tx
            .update(uploadSessionFiles)
            .set({ expectedByteSize: bytesByStoredFileId.get(target.storedFileId!)! })
            .where(eq(uploadSessionFiles.id, target.id))
        )
      );
      await tx
        .update(storedFiles)
        .set({ finalizedAt: now })
        .where(
          and(eq(storedFiles.ledgerId, session.ledgerId), inArray(storedFiles.id, storedFileIds))
        );
      await tx
        .update(uploadSessionFiles)
        .set({ status: "finalized" })
        .where(
          and(
            eq(uploadSessionFiles.uploadSessionId, session.id),
            inArray(uploadSessionFiles.targetId, targetIds)
          )
        );
      await tx
        .update(uploadSessions)
        .set({ status: "finalized", finalizedAt: now })
        .where(
          and(
            eq(uploadSessions.id, lockedSession.id),
            inArray(uploadSessions.status, ["open", "finalizing", "finalized"])
          )
        );
      return { files, targets };
    });
    // Preserve position order from the targets query, ensuring files are returned
    // in request order regardless of database default ordering
    const positionOrder = new Map(targets.map((t, i) => [t.storedFileId, i]));
    return files
      .sort((a, b) => (positionOrder.get(a.id) ?? 0) - (positionOrder.get(b.id) ?? 0))
      .map(mapStoredFile);
  }

  async readAuthorized(
    ledgerId: LedgerId,
    fileId: StoredFileId
  ): Promise<AuthorizedFileReadContract | null> {
    const row = await this.authorizedFiles.findForLedger(ledgerId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    const body = await this.storage.download(row.storageKey);
    return { file: mapStoredFile(row), body: new Uint8Array(body) };
  }

  async readAuthorizedForUser(
    userId: string,
    fileId: string
  ): Promise<AuthorizedFileReadContract | null> {
    const row = await this.authorizedFiles.findForUser(userId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    const body = await this.storage.download(row.storageKey);
    return { file: mapStoredFile(row), body: new Uint8Array(body) };
  }

  async readAuthorizedStreamForUser(
    userId: string,
    fileId: string
  ): Promise<{
    file: StoredFileContract;
    body: ReadableStream<Uint8Array>;
  } | null> {
    if (this.storage.stream == null) {
      const read = await this.readAuthorizedForUser(userId, fileId);
      if (read == null) return null;
      return {
        file: read.file,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(read.body);
            controller.close();
          },
        }),
      };
    }
    const row = await this.authorizedFiles.findForUser(userId, fileId);
    if (row == null) return null;
    if (row.storageProvider !== "s3") {
      throw new AppError(
        `Unsupported stored file provider: ${row.storageProvider}`,
        "UNSUPPORTED_STORAGE_PROVIDER",
        500,
        { provider: row.storageProvider, fileId: row.id }
      );
    }
    return { file: mapStoredFile(row), body: await this.storage.stream(row.storageKey) };
  }
}

export const storedFileAdapter = new StoredFileAdapter();

export async function createUploadPlanForSubmission(
  ledgerId: string,
  files: readonly UploadFileRequestContract[]
): Promise<UploadPlanContract | null> {
  return files.length === 0 ? null : storedFileAdapter.createUploadPlan(ledgerId, files);
}
