import crypto from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
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
import {
  ledgers,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
  uploadSessionFiles,
  uploadSessions,
} from "@/persistence";
import {
  MAX_FILES,
  MAX_ORIGINAL_BYTES_PER_FILE,
  MAX_NORMALIZED_BYTES_PER_REVISION,
  SUPPORTED_MIME_SET,
  UPLOAD_SESSION_EXPIRY_MS,
} from "@/modules/source-document/upload-policy";

interface ObjectFileStore {
  upload(key: string, data: Buffer, contentType: string): Promise<unknown>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<{ success: boolean; error?: Error }>;
  presignUpload?(
    key: string,
    contentType: string,
    sha256: string,
    expiresInSeconds: number
  ): Promise<{ url: string; requiredHeaders: Readonly<Record<string, string>> }>;
  head?(key: string): Promise<{
    byteSize: number;
    contentType: string;
    metadata: Readonly<Record<string, string>>;
  }>;
  copy?(sourceKey: string, destinationKey: string): Promise<void>;
}

type DirectObjectFileStore = Required<Pick<ObjectFileStore, "presignUpload" | "head" | "copy">> &
  ObjectFileStore;

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

function requireDirectStorage(storage: ObjectFileStore): DirectObjectFileStore {
  if (storage.presignUpload == null || storage.head == null || storage.copy == null) {
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
    private readonly storage: ObjectFileStore = getS3Storage(),
    private readonly now: () => Date = () => new Date()
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

    await db.transaction(async (tx) => {
      const ledger = await tx
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)))
        .then((rows) => rows[0]);
      if (ledger == null) throw new NotFoundError("Ledger");
      await tx.insert(uploadSessions).values({
        id: sessionId,
        ledgerId,
        finalizationTokenHash: tokenHash(finalizationToken),
        transport: "proxy",
        status: "open",
        expiresAt,
        createdAt: now,
      });
      for (const [position, file] of files.entries()) {
        await tx.insert(uploadSessionFiles).values({
          ledgerId,
          uploadSessionId: sessionId,
          targetId: targetIds[position]!,
          position,
          expectedContentType: file.contentType,
          expectedByteSize: file.byteSize,
          originalFilename: file.originalFilename,
          expectedChecksum: file.checksum ?? null,
          status: "planned",
        });
      }
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

    await db.transaction(async (tx) => {
      const ledger = await tx
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)))
        .then((rows) => rows[0]);
      if (ledger == null) throw new NotFoundError("Ledger");
      await tx.insert(uploadSessions).values({
        id: sessionId,
        ledgerId,
        finalizationTokenHash: tokenHash(finalizationToken),
        transport: "direct",
        status: "open",
        expiresAt,
        createdAt: now,
      });
      await tx.insert(uploadSessionFiles).values(
        files.map((file, position) => ({
          ledgerId,
          uploadSessionId: sessionId,
          targetId: targetIds[position]!,
          position,
          expectedContentType: file.contentType,
          expectedByteSize: file.byteSize,
          originalFilename: file.originalFilename,
          expectedChecksum: file.checksum!.toLowerCase(),
          status: "planned",
        }))
      );
    });

    try {
      const targets = await Promise.all(
        files.map(async (file, position) => {
          const targetId = targetIds[position]!;
          const signed = await storage.presignUpload(
            temporaryKey(ledgerId, sessionId, targetId),
            file.contentType,
            file.checksum!,
            Math.floor(UPLOAD_SESSION_EXPIRY_MS / 1000)
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
    if (session.status === "open") {
      if (session.expiresAt.getTime() <= now.getTime()) {
        await db
          .update(uploadSessions)
          .set({ status: "expired" })
          .where(and(eq(uploadSessions.id, session.id), eq(uploadSessions.status, "open")));
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

    try {
      const inspected = await Promise.all(
        targets.map((target) =>
          storage.head(temporaryKey(session.ledgerId, session.id, target.targetId))
        )
      );
      for (const [position, target] of targets.entries()) {
        const actual = inspected[position]!;
        if (
          actual.byteSize !== target.expectedByteSize ||
          actual.contentType !== target.expectedContentType ||
          actual.metadata.sha256 !== target.expectedChecksum
        ) {
          throw new ConflictError("Uploaded object metadata does not match the upload plan");
        }
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
      }
      throw error;
    }

    await Promise.all(
      targets.map(async (target) => {
        if (target.status === "uploaded" || target.status === "finalized") return;
        const storedFileId = target.targetId;
        const storageKey = durableKey(session.ledgerId, storedFileId);
        await storage.copy(temporaryKey(session.ledgerId, session.id, target.targetId), storageKey);
        await db.transaction(async (tx) => {
          await tx
            .insert(storedFiles)
            .values({
              id: storedFileId,
              ledgerId: session.ledgerId,
              storageProvider: "s3",
              storageKey,
              contentType: target.expectedContentType!,
              byteSize: target.expectedByteSize!,
              originalFilename: target.originalFilename,
              checksum: target.expectedChecksum!,
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
            file.contentType !== target.expectedContentType ||
            file.byteSize !== target.expectedByteSize ||
            file.checksum !== target.expectedChecksum
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
      })
    );

    const files = await this.finalizeUpload(input);
    const cleanupResults = await Promise.all(
      targets.map((target) =>
        storage.delete(temporaryKey(session.ledgerId, session.id, target.targetId))
      )
    );
    if (cleanupResults.some((result) => !result.success)) {
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
      if (
        session.status !== "open" &&
        session.status !== "finalizing" &&
        session.status !== "finalized"
      ) {
        throw new ConflictError("Upload session cannot be finalized");
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
        .where(eq(uploadSessions.id, session.id));
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
    const rows = await db
      .select({ file: storedFiles })
      .from(storedFiles)
      .innerJoin(
        revisionFiles,
        and(
          eq(revisionFiles.ledgerId, storedFiles.ledgerId),
          eq(revisionFiles.storedFileId, storedFiles.id)
        )
      )
      .innerJoin(
        sourceDocumentRevisions,
        and(
          eq(sourceDocumentRevisions.ledgerId, revisionFiles.ledgerId),
          eq(sourceDocumentRevisions.id, revisionFiles.revisionId)
        )
      )
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.ledgerId, sourceDocumentRevisions.ledgerId),
          eq(sourceDocuments.id, sourceDocumentRevisions.sourceDocumentId)
        )
      )
      .where(
        and(
          eq(storedFiles.ledgerId, ledgerId),
          eq(storedFiles.id, fileId),
          isNotNull(storedFiles.finalizedAt),
          isNull(storedFiles.deletedAt),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .limit(1);
    const row = rows[0]?.file;
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
    const owner = await db
      .select({ ledgerId: storedFiles.ledgerId })
      .from(storedFiles)
      .innerJoin(ledgers, and(eq(ledgers.id, storedFiles.ledgerId), isNull(ledgers.deletedAt)))
      .where(and(eq(storedFiles.id, fileId), eq(ledgers.userId, userId)))
      .limit(1);
    const ledgerId = owner[0]?.ledgerId;
    return ledgerId == null ? null : this.readAuthorized(ledgerId, fileId);
  }
}

export const storedFileAdapter = new StoredFileAdapter();

export async function createUploadPlanForSubmission(
  ledgerId: string,
  files: readonly UploadFileRequestContract[]
): Promise<UploadPlanContract | null> {
  return files.length === 0 ? null : storedFileAdapter.createUploadPlan(ledgerId, files);
}
