import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { objectCleanupJobs, uploadSessionFiles, uploadSessions } from "@/persistence";
import { getS3Storage } from "@/lib/storage/s3";
import { logger } from "@/lib/logger";
import { runBoundedExchangeRateRecalculation } from "@/application/orchestration/exchange-rate-ledger-recalculation";

const LIMIT = 1000;
const MAINTENANCE_LOCK = 1_381_247_119;

export async function runBoundedMaintenance(now = new Date()): Promise<void> {
  const acquired = await db.transaction(async (tx) => {
    const lock = await tx.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${MAINTENANCE_LOCK}) AS acquired`
    );
    if (lock.rows?.[0]?.acquired !== true) return false;
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    await tx.execute(sql`DELETE FROM rate_limit_buckets WHERE bucket_key IN (
      SELECT bucket_key FROM rate_limit_buckets WHERE window_start < ${twoDaysAgo} LIMIT ${LIMIT}
    )`);
    await tx.execute(sql`DELETE FROM idempotency_records WHERE (credential_id, key) IN (
      SELECT credential_id, key FROM idempotency_records
      WHERE expires_at < ${now} OR (status = 'completed' AND completed_at < ${dayAgo})
      LIMIT ${LIMIT}
    )`);
    await tx.execute(sql`DELETE FROM otp_tokens WHERE id IN (
      SELECT id FROM otp_tokens WHERE expires < ${now} LIMIT ${LIMIT}
    )`);

    const staleSessions = await tx
      .select({ id: uploadSessions.id, ledgerId: uploadSessions.ledgerId })
      .from(uploadSessions)
      .where(
        and(
          or(
            inArray(uploadSessions.status, ["expired", "cancelled", "finalized"]),
            lt(uploadSessions.expiresAt, dayAgo)
          ),
          lt(uploadSessions.createdAt, dayAgo)
        )
      )
      .limit(LIMIT);
    const sessionIds = staleSessions.map((session) => session.id);
    if (sessionIds.length > 0) {
      const targets = await tx
        .select({
          uploadSessionId: uploadSessionFiles.uploadSessionId,
          targetId: uploadSessionFiles.targetId,
        })
        .from(uploadSessionFiles)
        .where(inArray(uploadSessionFiles.uploadSessionId, sessionIds));
      const ledgerBySession = new Map(
        staleSessions.map((session) => [session.id, session.ledgerId])
      );
      if (targets.length > 0) {
        await tx
          .insert(objectCleanupJobs)
          .values(
            targets.map((target) => ({
              storageKey: `temporary/${ledgerBySession.get(target.uploadSessionId)!}/${target.uploadSessionId}/${target.targetId}`,
              uploadSessionId: target.uploadSessionId,
              nextAttemptAt: now,
            }))
          )
          .onConflictDoNothing({ target: objectCleanupJobs.storageKey });
      }
      const sessionsWithoutTargets = sessionIds.filter(
        (id) => !targets.some((target) => target.uploadSessionId === id)
      );
      if (sessionsWithoutTargets.length > 0) {
        await tx.delete(uploadSessions).where(inArray(uploadSessions.id, sessionsWithoutTargets));
      }
    }

    await tx.execute(sql`WITH doomed AS (
      SELECT ledger_id, version FROM ledger_change_batches batch
      WHERE batch.created_at < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
        AND batch.version <= (
          SELECT greatest(max(newer.version) - 10000, 0)
          FROM ledger_change_batches newer WHERE newer.ledger_id = batch.ledger_id
        )
      LIMIT ${LIMIT}
    ) DELETE FROM ledger_change_batches batch USING doomed
      WHERE batch.ledger_id = doomed.ledger_id AND batch.version = doomed.version`);
    return true;
  });
  if (!acquired) return;

  await runBoundedExchangeRateRecalculation(now);

  const jobs = await db
    .select()
    .from(objectCleanupJobs)
    .where(sql`${objectCleanupJobs.nextAttemptAt} <= ${now}`)
    .orderBy(objectCleanupJobs.nextAttemptAt, objectCleanupJobs.createdAt)
    .limit(LIMIT);
  if (jobs.length === 0) return;
  const storage = getS3Storage();
  for (const job of jobs) {
    const result = await storage.delete(job.storageKey);
    if (!result.success) {
      const attempts = job.attempts + 1;
      const backoffMs = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 12));
      await db
        .update(objectCleanupJobs)
        .set({
          attempts,
          nextAttemptAt: new Date(now.getTime() + backoffMs),
          lastError: result.error?.name ?? "ObjectDeleteFailed",
        })
        .where(eq(objectCleanupJobs.id, job.id));
      logger.warn({ cleanupJobId: job.id, attempts }, "Object cleanup will be retried");
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.delete(objectCleanupJobs).where(eq(objectCleanupJobs.id, job.id));
      if (job.uploadSessionId == null) return;
      const remaining = await tx
        .select({ id: objectCleanupJobs.id })
        .from(objectCleanupJobs)
        .where(eq(objectCleanupJobs.uploadSessionId, job.uploadSessionId))
        .limit(1);
      if (remaining.length === 0) {
        await tx.delete(uploadSessions).where(eq(uploadSessions.id, job.uploadSessionId));
      }
    });
  }
}
