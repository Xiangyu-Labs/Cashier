import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError, ConflictError } from "@/lib/errors";
import { idempotencyRecords } from "@/persistence";

const TTL_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 30_000;
const RENEW_INTERVAL_MS = 10_000;
const WAIT_ATTEMPTS = 10;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runIdempotentUserMutation<TResult>(
  input: { userId: string; key: string; fingerprint: string },
  mutation: () => Promise<TResult>
): Promise<TResult> {
  const key = input.key;
  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const claimed = await db
    .insert(idempotencyRecords)
    .values({
      principalType: "user",
      principalId: input.userId,
      key,
      status: "pending",
      contentFingerprint: input.fingerprint,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      expiresAt: new Date(now.getTime() + TTL_MS),
    })
    .onConflictDoUpdate({
      target: [
        idempotencyRecords.principalType,
        idempotencyRecords.principalId,
        idempotencyRecords.key,
      ],
      set: {
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        expiresAt: new Date(now.getTime() + TTL_MS),
      },
      setWhere: sql`${idempotencyRecords.status} = 'pending'
        AND ${idempotencyRecords.leaseExpiresAt} < ${now}
        AND ${idempotencyRecords.contentFingerprint} IS NOT DISTINCT FROM ${input.fingerprint}`,
    })
    .returning({ key: idempotencyRecords.key });

  if (claimed.length === 1) {
    const heartbeat = setInterval(() => {
      void db
        .update(idempotencyRecords)
        .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
        .where(
          and(
            eq(idempotencyRecords.principalType, "user"),
            eq(idempotencyRecords.principalId, input.userId),
            eq(idempotencyRecords.key, key),
            eq(idempotencyRecords.status, "pending"),
            eq(idempotencyRecords.leaseToken, leaseToken)
          )
        )
        .catch(() => undefined);
    }, RENEW_INTERVAL_MS);
    try {
      const result = await mutation();
      const completed = await db
        .update(idempotencyRecords)
        .set({ status: "completed", result: { value: result }, completedAt: new Date() })
        .where(
          and(
            eq(idempotencyRecords.principalType, "user"),
            eq(idempotencyRecords.principalId, input.userId),
            eq(idempotencyRecords.key, key),
            eq(idempotencyRecords.status, "pending"),
            eq(idempotencyRecords.contentFingerprint, input.fingerprint),
            eq(idempotencyRecords.leaseToken, leaseToken)
          )
        )
        .returning({ key: idempotencyRecords.key });
      if (completed.length !== 1) throw new ConflictError("Idempotency claim was lost");
      return result;
    } catch (error) {
      await db
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.principalType, "user"),
            eq(idempotencyRecords.principalId, input.userId),
            eq(idempotencyRecords.key, key),
            eq(idempotencyRecords.status, "pending"),
            eq(idempotencyRecords.contentFingerprint, input.fingerprint),
            eq(idempotencyRecords.leaseToken, leaseToken)
          )
        );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    const record = await db.query.idempotencyRecords.findFirst({
      where: and(
        eq(idempotencyRecords.principalType, "user"),
        eq(idempotencyRecords.principalId, input.userId),
        eq(idempotencyRecords.key, key)
      ),
    });
    if (record != null && record.contentFingerprint !== input.fingerprint) {
      throw new AppError(
        "Operation ID was already used with different content",
        "IDEMPOTENCY_CONFLICT",
        409
      );
    }
    if (record?.status === "completed") {
      return (record.result as { value: TResult }).value;
    }
    if (record == null || (record.leaseExpiresAt != null && record.leaseExpiresAt <= new Date())) {
      return runIdempotentUserMutation(input, mutation);
    }
    await wait(Math.min(25 * 2 ** attempt, 500));
  }
  throw new ConflictError("The idempotent operation is still in progress");
}

export function runIdempotentLedgerEntryMutation<TResult>(
  input: { userId: string; ledgerId: string; operationId: string; fingerprint: string },
  mutation: () => Promise<TResult>
): Promise<TResult> {
  return runIdempotentUserMutation(
    {
      userId: input.userId,
      key: `ledger-entry:${input.ledgerId}:${input.operationId}`,
      fingerprint: input.fingerprint,
    },
    mutation
  );
}
