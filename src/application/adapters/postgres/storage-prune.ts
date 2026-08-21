import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { databasePool, db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  getS3Storage,
  type S3ListedObject,
  type S3ObjectMetadata,
  type S3ListObjectsPage,
} from "@/lib/storage/s3";
import { objectCleanupJobs, storedFiles, uploadSessions } from "@/persistence";

/**
 * Safe storage prune.
 *
 * The default run only scans and reports; nothing is deleted unless the
 * caller explicitly enables `apply`. Business data (soft-deleted source
 * documents and their revisions) is never touched.
 *
 * A PostgreSQL advisory lock serialises prune/maintenance runs so two
 * instances cannot delete concurrently.
 */

export const PRUNE_ADVISORY_LOCK = 1_381_247_120;

/** Minimal storage surface used by the prune pass (S3StorageProvider fits). */
export interface PruneStorage {
  listObjectsPage(
    prefix: string,
    continuationToken?: string | null,
    maxKeys?: number
  ): Promise<S3ListObjectsPage>;
  head(key: string): Promise<S3ObjectMetadata>;
  delete(key: string): Promise<{ success: boolean; key?: string; error?: Error }>;
}

const TEMPORARY_PREFIX = "temporary/";
const DAY_MS = 24 * 60 * 60 * 1000;

function isDurableStorageKey(key: string): boolean {
  const segments = key.split("/");
  return (
    segments.length === 3 && segments[0] !== "" && segments[1] === "stored" && segments[2] !== ""
  );
}

export interface StoragePruneOptions {
  apply?: boolean;
  batchSize?: number;
  orphanGraceDays?: number;
  temporaryGraceHours?: number;
  now?: Date;
  storage?: PruneStorage;
}

export interface PruneExpiredRecordCounts {
  rateLimitBuckets: number;
  otpTokens: number;
  idempotencyRecords: number;
  uploadSessions: number;
  ledgerChangeBatches: number;
  objectCleanupJobs: number;
}

export interface PruneFileCounts {
  count: number;
  bytes: number;
  deleted: number;
  deletedBytes: number;
  failed: number;
  missing: number;
  missingBytes: number;
}

export interface StoragePruneSummary {
  mode: "dry-run" | "apply";
  now: string;
  expiredRecords: PruneExpiredRecordCounts;
  unreferencedFiles: PruneFileCounts;
  durableOrphans: PruneFileCounts;
  temporaryOrphans: PruneFileCounts;
  /** DB rows whose R2 object is missing — reported, never auto-deleted. */
  missingObjects: { count: number; bytes: number };
  errors: string[];
}

function emptyCounts(): PruneFileCounts {
  return {
    count: 0,
    bytes: 0,
    deleted: 0,
    deletedBytes: 0,
    failed: 0,
    missing: 0,
    missingBytes: 0,
  };
}

function emptySummary(now: Date, apply: boolean): StoragePruneSummary {
  return {
    mode: apply ? "apply" : "dry-run",
    now: now.toISOString(),
    expiredRecords: {
      rateLimitBuckets: 0,
      otpTokens: 0,
      idempotencyRecords: 0,
      uploadSessions: 0,
      ledgerChangeBatches: 0,
      objectCleanupJobs: 0,
    },
    unreferencedFiles: emptyCounts(),
    durableOrphans: emptyCounts(),
    temporaryOrphans: emptyCounts(),
    missingObjects: { count: 0, bytes: 0 },
    errors: [],
  };
}

function affectedRowCount(result: {
  rowCount: number | null;
  rows?: Array<Record<string, unknown>>;
}): number {
  const counted = result.rows?.[0]?.count;
  return counted == null ? (result.rowCount ?? 0) : Number(counted);
}

function isMissingObjectError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const value = error as { code?: string; name?: string };
  return value.code === "FILE_NOT_FOUND" || value.name === "FILE_NOT_FOUND";
}

async function ensureCleanupJob(storageKey: string): Promise<void> {
  await db
    .insert(objectCleanupJobs)
    .values({ storageKey })
    .onConflictDoNothing({ target: objectCleanupJobs.storageKey });
}

async function finalizeCleanupJob(storageKey: string): Promise<void> {
  await db.delete(objectCleanupJobs).where(eq(objectCleanupJobs.storageKey, storageKey));
}

async function deferCleanupJob(storageKey: string, error: unknown, now: Date): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(objectCleanupJobs)
    .set({
      attempts: sql`${objectCleanupJobs.attempts} + 1`,
      lastError: message.slice(0, 1000),
      nextAttemptAt: new Date(now.getTime() + 60 * 60 * 1000),
    })
    .where(eq(objectCleanupJobs.storageKey, storageKey));
}

async function deleteQueuedObject(
  storage: PruneStorage,
  storageKey: string,
  now: Date
): Promise<boolean> {
  await ensureCleanupJob(storageKey);
  try {
    const deleted = await storage.delete(storageKey);
    if (!deleted.success) throw deleted.error ?? new Error("Object deletion failed");
    await finalizeCleanupJob(storageKey);
    return true;
  } catch (error) {
    await deferCleanupJob(storageKey, error, now);
    return false;
  }
}

async function forEachDurableObjectPage(
  storage: PruneStorage,
  batchSize: number,
  visit: (objects: S3ListedObject[]) => Promise<void>
): Promise<void> {
  let continuationToken: string | null = null;
  do {
    const page = await storage.listObjectsPage("", continuationToken, batchSize);
    const durable = page.objects.filter((object) => isDurableStorageKey(object.key));
    if (durable.length > 0) await visit(durable);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken != null);
}

async function forEachTemporaryObjectPage(
  storage: PruneStorage,
  batchSize: number,
  visit: (objects: S3ListedObject[]) => Promise<void>
): Promise<void> {
  let continuationToken: string | null = null;
  do {
    const page = await storage.listObjectsPage(TEMPORARY_PREFIX, continuationToken, batchSize);
    if (page.objects.length > 0) await visit(page.objects);
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
  } while (continuationToken != null);
}

function parseTemporaryKey(key: string): {
  ledgerId: string;
  sessionId: string;
  targetId: string;
} | null {
  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== "temporary") return null;
  return { ledgerId: parts[1]!, sessionId: parts[2]!, targetId: parts[3]! };
}

async function loadValidTemporarySessions(
  pairs: readonly { ledgerId: string; sessionId: string }[],
  now: Date
): Promise<Set<string>> {
  const uniqueIds = [...new Set(pairs.map((pair) => pair.sessionId))];
  if (uniqueIds.length === 0) return new Set();
  const sessions = await db
    .select({
      id: uploadSessions.id,
      ledgerId: uploadSessions.ledgerId,
      status: uploadSessions.status,
      expiresAt: uploadSessions.expiresAt,
    })
    .from(uploadSessions)
    .where(inArray(uploadSessions.id, uniqueIds));
  const valid = new Set<string>();
  for (const session of sessions) {
    if (session.status === "finalizing") valid.add(session.id);
    if (session.status === "open" && session.expiresAt.getTime() > now.getTime()) {
      valid.add(session.id);
    }
  }
  return valid;
}

/**
 * Runs one bounded prune pass. Caller must hold the advisory lock.
 * Returns the summary; throws only on fatal (lock or listing) failures.
 */
export async function runStoragePrune(
  options: StoragePruneOptions = {}
): Promise<StoragePruneSummary> {
  const now = options.now ?? new Date();
  const apply = options.apply === true;
  const batchSize = Math.max(1, options.batchSize ?? 100);
  const orphanGraceDays = Math.max(1, options.orphanGraceDays ?? 7);
  const temporaryGraceHours = Math.max(1, options.temporaryGraceHours ?? 24);
  const summary = emptySummary(now, apply);
  const storage = options.storage ?? getS3Storage();
  const attemptedCleanupKeys = new Set<string>();

  const fileCutoff = new Date(now.getTime() - orphanGraceDays * DAY_MS);
  const temporaryCutoff = new Date(now.getTime() - temporaryGraceHours * 60 * 60 * 1000);

  try {
    // 1. Expired operational records (rate limits, OTP, idempotency, sessions,
    //    change log, cleanup jobs). Dry runs count the candidates without
    //    deleting anything.
    const expiredRateLimits = await (apply
      ? db.execute<{ bucket_key: string }>(sql`
          WITH doomed AS (
            SELECT bucket_key FROM rate_limit_buckets
            WHERE window_start < ${new Date(now.getTime() - 2 * DAY_MS)}
            LIMIT ${batchSize * 10}
          )
          DELETE FROM rate_limit_buckets USING doomed
          WHERE rate_limit_buckets.bucket_key = doomed.bucket_key
          RETURNING rate_limit_buckets.bucket_key
        `)
      : db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM rate_limit_buckets
          WHERE window_start < ${new Date(now.getTime() - 2 * DAY_MS)}
        `));
    summary.expiredRecords.rateLimitBuckets = affectedRowCount(expiredRateLimits);

    const expiredOtp = await (apply
      ? db.execute<{ id: string }>(sql`
          DELETE FROM otp_tokens WHERE id IN (
            SELECT id FROM otp_tokens WHERE expires < ${now} LIMIT ${batchSize * 10}
          )
          RETURNING id
        `)
      : db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM otp_tokens
          WHERE expires < ${now}
        `));
    summary.expiredRecords.otpTokens = affectedRowCount(expiredOtp);

    const expiredIdempotency = await (apply
      ? db.execute<{ principalType: string; principalId: string; key: string }>(sql`
          DELETE FROM idempotency_records WHERE (principal_type, principal_id, key) IN (
            SELECT principal_type, principal_id, key FROM idempotency_records
            WHERE expires_at < ${now} OR (status = 'completed' AND completed_at < ${new Date(now.getTime() - DAY_MS)})
            LIMIT ${batchSize * 10}
          )
          RETURNING principal_type, principal_id, key
        `)
      : db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM idempotency_records
          WHERE expires_at < ${now}
             OR (status = 'completed' AND completed_at < ${new Date(now.getTime() - DAY_MS)})
        `));
    summary.expiredRecords.idempotencyRecords = affectedRowCount(expiredIdempotency);

    const staleSessions = await db
      .select({ id: uploadSessions.id })
      .from(uploadSessions)
      .where(
        and(
          or(
            inArray(uploadSessions.status, ["expired", "cancelled", "finalized"]),
            lt(uploadSessions.expiresAt, new Date(now.getTime() - DAY_MS))
          ),
          lt(uploadSessions.createdAt, new Date(now.getTime() - DAY_MS))
        )
      )
      .limit(batchSize * 10);
    const sessionIds = staleSessions.map((session) => session.id);
    if (sessionIds.length > 0 && apply) {
      // Cascade deletes the session's upload_session_files rows; the orphaned
      // temporary objects are removed by the temporary-object scan below.
      await db.delete(uploadSessions).where(inArray(uploadSessions.id, sessionIds));
    }
    summary.expiredRecords.uploadSessions = sessionIds.length;

    const staleChangeLog = await (apply
      ? db.execute<{ ledgerId: string; version: bigint }>(sql`
          WITH doomed AS (
            SELECT ledger_id, version FROM ledger_change_batches batch
            WHERE batch.created_at < ${new Date(now.getTime() - 30 * DAY_MS)}
              AND batch.version <= (
                SELECT greatest(max(newer.version) - 10000, 0)
                FROM ledger_change_batches newer WHERE newer.ledger_id = batch.ledger_id
              )
            LIMIT ${batchSize * 10}
          )
          DELETE FROM ledger_change_batches batch USING doomed
          WHERE batch.ledger_id = doomed.ledger_id AND batch.version = doomed.version
          RETURNING batch.ledger_id, batch.version
        `)
      : db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM ledger_change_batches batch
          WHERE batch.created_at < ${new Date(now.getTime() - 30 * DAY_MS)}
            AND batch.version <= (
              SELECT greatest(max(newer.version) - 10000, 0)
              FROM ledger_change_batches newer WHERE newer.ledger_id = batch.ledger_id
            )
        `));
    summary.expiredRecords.ledgerChangeBatches = affectedRowCount(staleChangeLog);

    const staleCleanupJobs = await (apply
      ? db.execute<{ id: string }>(sql`
          DELETE FROM object_cleanup_jobs WHERE id IN (
            SELECT id FROM object_cleanup_jobs
            WHERE (attempts >= 12 OR next_attempt_at < ${new Date(now.getTime() - 30 * DAY_MS)})
              AND created_at < ${new Date(now.getTime() - 30 * DAY_MS)}
            LIMIT ${batchSize * 10}
          )
          RETURNING id
        `)
      : db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM object_cleanup_jobs
          WHERE (attempts >= 12 OR next_attempt_at < ${new Date(now.getTime() - 30 * DAY_MS)})
            AND created_at < ${new Date(now.getTime() - 30 * DAY_MS)}
        `));
    summary.expiredRecords.objectCleanupJobs = affectedRowCount(staleCleanupJobs);

    // 2. Unreferenced stored files. The row is claimed (deleted) first with a
    //    reference recheck so a concurrent submission cannot attach the file
    //    between the scan and the external delete; only then is the R2 object
    //    removed. A failed object delete leaves a durable orphan that the next
    //    prune removes.
    let unreferencedBatch: (typeof storedFiles.$inferSelect)[] = [];
    const seenFileIds = new Set<string>();
    do {
      unreferencedBatch = await db
        .select()
        .from(storedFiles)
        .where(
          and(
            isNull(storedFiles.deletedAt),
            lt(storedFiles.createdAt, fileCutoff),
            ...(seenFileIds.size === 0 ? [] : [notInArray(storedFiles.id, [...seenFileIds])]),
            sql`NOT EXISTS (
              SELECT 1 FROM revision_files rf
              WHERE rf.ledger_id = ${storedFiles.ledgerId}
                AND rf.stored_file_id = ${storedFiles.id}
            )`,
            sql`NOT EXISTS (
              SELECT 1 FROM upload_session_files usf
              JOIN upload_sessions us
                ON us.ledger_id = usf.ledger_id AND us.id = usf.upload_session_id
              WHERE usf.ledger_id = ${storedFiles.ledgerId}
                AND usf.stored_file_id = ${storedFiles.id}
                AND us.status IN ('open', 'finalizing')
            )`
          )
        )
        .limit(batchSize);

      for (const file of unreferencedBatch) {
        seenFileIds.add(file.id);
        summary.unreferencedFiles.count += 1;
        summary.unreferencedFiles.bytes += file.byteSize;
        try {
          await storage.head(file.storageKey);
        } catch (error) {
          if (isMissingObjectError(error)) {
            summary.unreferencedFiles.missing += 1;
            summary.unreferencedFiles.missingBytes += file.byteSize;
            summary.missingObjects.count += 1;
            summary.missingObjects.bytes += file.byteSize;
            logger.warn(
              { storedFileId: file.id, storageKey: file.storageKey },
              "Stored file row references a missing R2 object; keeping the row"
            );
            continue;
          }
          summary.unreferencedFiles.failed += 1;
          summary.errors.push(`head failed: ${file.storageKey}`);
          continue;
        }

        if (!apply) continue;
        const claimed = await db.transaction(async (tx) => {
          const deleted = await tx
            .delete(storedFiles)
            .where(
              and(
                eq(storedFiles.id, file.id),
                eq(storedFiles.storageKey, file.storageKey),
                sql`NOT EXISTS (
                  SELECT 1 FROM revision_files rf
                  WHERE rf.ledger_id = ${storedFiles.ledgerId}
                    AND rf.stored_file_id = ${storedFiles.id}
                )`,
                sql`NOT EXISTS (
                  SELECT 1 FROM upload_session_files usf
                  JOIN upload_sessions us
                    ON us.ledger_id = usf.ledger_id AND us.id = usf.upload_session_id
                  WHERE usf.ledger_id = ${storedFiles.ledgerId}
                    AND usf.stored_file_id = ${storedFiles.id}
                    AND us.status IN ('open', 'finalizing')
                )`
              )
            )
            .returning({ id: storedFiles.id })
            .then((rows) => rows[0]);
          if (deleted != null) {
            await tx
              .insert(objectCleanupJobs)
              .values({ storageKey: file.storageKey })
              .onConflictDoNothing({ target: objectCleanupJobs.storageKey });
          }
          return deleted;
        });
        if (claimed == null) {
          logger.debug(
            { storedFileId: file.id, storageKey: file.storageKey },
            "Stored file became referenced before deletion; skipping"
          );
          continue;
        }
        attemptedCleanupKeys.add(file.storageKey);
        if (!(await deleteQueuedObject(storage, file.storageKey, now))) {
          summary.unreferencedFiles.failed += 1;
          summary.errors.push(`delete failed after row claim: ${file.storageKey}`);
          continue;
        }
        summary.unreferencedFiles.deleted += 1;
        summary.unreferencedFiles.deletedBytes += file.byteSize;
      }
    } while (unreferencedBatch.length > 0);

    // 3. Durable orphans: R2 objects with no stored_files row at all.
    await forEachDurableObjectPage(storage, batchSize, async (pageObjects) => {
      const oldObjects = pageObjects.filter(
        (object) =>
          object.lastModified != null &&
          object.lastModified <= fileCutoff &&
          !attemptedCleanupKeys.has(object.key)
      );
      if (oldObjects.length === 0) return;
      const keys = oldObjects.map((object) => object.key);
      const rows = await db
        .select({ storageKey: storedFiles.storageKey })
        .from(storedFiles)
        .where(inArray(storedFiles.storageKey, keys));
      const knownKeys = new Set(rows.map((row) => row.storageKey));
      for (const object of oldObjects) {
        if (knownKeys.has(object.key)) continue;
        summary.durableOrphans.count += 1;
        summary.durableOrphans.bytes += object.byteSize;
        if (!apply) continue;
        attemptedCleanupKeys.add(object.key);
        if (await deleteQueuedObject(storage, object.key, now)) {
          summary.durableOrphans.deleted += 1;
          summary.durableOrphans.deletedBytes += object.byteSize;
        } else {
          summary.durableOrphans.failed += 1;
          summary.errors.push(`durable orphan delete failed: ${object.key}`);
        }
      }
    });

    // 4. Temporary orphans: R2 temporary objects with no valid open/finalizing session.
    await forEachTemporaryObjectPage(storage, batchSize, async (pageObjects) => {
      const oldTemporary = pageObjects.filter(
        (object) =>
          object.lastModified != null &&
          object.lastModified <= temporaryCutoff &&
          !attemptedCleanupKeys.has(object.key)
      );
      if (oldTemporary.length === 0) return;
      const parsedPairs = oldTemporary.flatMap((object) => {
        const parsed = parseTemporaryKey(object.key);
        return parsed == null ? [] : [{ ...parsed, object }];
      });
      if (parsedPairs.length === 0) return;
      const validSessions = await loadValidTemporarySessions(
        parsedPairs.map(({ ledgerId, sessionId }) => ({ ledgerId, sessionId })),
        now
      );
      const orphanTargets = parsedPairs.filter(({ sessionId }) => !validSessions.has(sessionId));
      for (const target of orphanTargets) {
        summary.temporaryOrphans.count += 1;
        summary.temporaryOrphans.bytes += target.object.byteSize;
        if (!apply) continue;
        attemptedCleanupKeys.add(target.object.key);
        if (await deleteQueuedObject(storage, target.object.key, now)) {
          summary.temporaryOrphans.deleted += 1;
          summary.temporaryOrphans.deletedBytes += target.object.byteSize;
        } else {
          summary.temporaryOrphans.failed += 1;
          summary.errors.push(`temporary orphan delete failed: ${target.object.key}`);
        }
      }
    });
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  }

  return summary;
}

/**
 * Executes the prune under the advisory lock. Dry-run by default.
 */
export async function executeStoragePrune(
  options: StoragePruneOptions = {}
): Promise<StoragePruneSummary> {
  const client = await databasePool.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [PRUNE_ADVISORY_LOCK]
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Another prune/maintenance run holds the advisory lock");
    }
    return runStoragePrune(options);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [PRUNE_ADVISORY_LOCK]).catch(() => {});
    client.release();
  }
}
