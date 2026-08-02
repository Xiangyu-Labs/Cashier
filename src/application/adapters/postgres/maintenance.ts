import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadSessionFiles, uploadSessions } from "@/persistence";
import { getS3Storage } from "@/lib/storage/s3";
import { logger } from "@/lib/logger";

const LIMIT = 1000;
const MAINTENANCE_LOCK = 1_381_247_119;

export async function runBoundedMaintenance(now = new Date()): Promise<void> {
  const temporaryKeys: string[] = [];
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

    const sessions = await tx
      .select({
        id: uploadSessions.id,
        ledgerId: uploadSessions.ledgerId,
        targetId: uploadSessionFiles.targetId,
      })
      .from(uploadSessions)
      .leftJoin(uploadSessionFiles, eq(uploadSessionFiles.uploadSessionId, uploadSessions.id))
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
    const sessionIds = [...new Set(sessions.map((session) => session.id))];
    for (const session of sessions) {
      if (session.targetId != null) {
        temporaryKeys.push(`temporary/${session.ledgerId}/${session.id}/${session.targetId}`);
      }
    }
    if (sessionIds.length > 0) {
      await tx.delete(uploadSessions).where(inArray(uploadSessions.id, sessionIds));
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
  if (!acquired || temporaryKeys.length === 0) return;
  const storage = getS3Storage();
  const results = await Promise.all(temporaryKeys.map((key) => storage.delete(key)));
  if (results.some((result) => !result.success)) {
    logger.warn("Temporary object maintenance was incomplete");
  }
}
