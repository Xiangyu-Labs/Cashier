import crypto from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type {
  AuthorizedFileReadContract,
  LedgerId,
  StoredFileContract,
  StoredFileId,
  StoredFilePort,
  UploadFileRequestContract,
  UploadFinalizationContract,
  UploadPlanContract,
} from "@/application/contracts";
import { db } from "@/lib/db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getR2Storage } from "@/lib/storage/r2";
import {
  ledgers,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
  uploadSessionFiles,
  uploadSessions,
} from "@/persistence";

export const UPLOAD_LIMITS = {
  maxFiles: 10,
  maxBytesPerFile: 10 * 1024 * 1024,
  expiresInMs: 15 * 60 * 1000,
} as const;

const SUPPORTED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

interface ObjectFileStore {
  upload(key: string, data: Buffer, contentType: string): Promise<unknown>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<{ success: boolean; error?: Error }>;
}

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
  if (files.length === 0 || files.length > UPLOAD_LIMITS.maxFiles) {
    throw new ValidationError(`Upload plans require 1-${UPLOAD_LIMITS.maxFiles} files`);
  }
  for (const file of files) {
    if (!SUPPORTED_CONTENT_TYPES.has(file.contentType)) {
      throw new ValidationError("Unsupported upload content type");
    }
    if (
      !Number.isInteger(file.byteSize) ||
      file.byteSize <= 0 ||
      file.byteSize > UPLOAD_LIMITS.maxBytesPerFile
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

export class StoredFileAdapter implements StoredFilePort {
  constructor(
    private readonly storage: ObjectFileStore = getR2Storage(),
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
    const expiresAt = new Date(now.getTime() + UPLOAD_LIMITS.expiresInMs);
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
      maxFiles: UPLOAD_LIMITS.maxFiles,
      maxBytesPerFile: UPLOAD_LIMITS.maxBytesPerFile,
    };
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
    if (session == null || session.status !== "open") throw new NotFoundError("Upload target");
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
      bytes.length > UPLOAD_LIMITS.maxBytesPerFile
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
            storageProvider: "r2",
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
          { provider: "r2", storageKey, cleanupError: cleanup.error },
          "Failed to clean up R2 object after database transaction failure"
        );
      }
      throw error;
    }
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
      if (session.status !== "open" && session.status !== "finalized") {
        throw new ConflictError("Upload session cannot be finalized");
      }
      const storedFileIds = targets.map((target) => target.storedFileId!);
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
      const files = await tx
        .select()
        .from(storedFiles)
        .where(
          and(eq(storedFiles.ledgerId, session.ledgerId), inArray(storedFiles.id, storedFileIds))
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
    if (row.storageProvider !== "r2") {
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
