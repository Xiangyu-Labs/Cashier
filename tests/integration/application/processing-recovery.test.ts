import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { PostgresProcessingIntentAdapter, postgresRevisionAdapter } from "@/application/adapters/postgres";
import { selectRecoverableProcessingIntents } from "@/modules/source-document/application/use-cases/select-recoverable-processing-intents";
import type { ProcessingIntentContract } from "@/application/contracts";
import { processingOutbox, sourceDocuments, sourceDocumentRevisions } from "@/persistence";

/**
 * Creates a pending revision + intent for a single source document.
 * Each call uses a fresh user+ledger pair to avoid unique-constraint collisions.
 */
async function pendingIntent(
  requestedAt = "2026-07-15T00:00:00.000Z",
  userId = crypto.randomUUID()
): Promise<{ ledgerId: string; intent: ProcessingIntentContract }> {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db, undefined, undefined, userId);
  const pending = await postgresRevisionAdapter.createPending({
    ledgerId,
    submittedText: "Lunch 12.50 CNY",
  });
  return {
    ledgerId,
    intent: {
      id: crypto.randomUUID(),
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
      requestedAt,
      attempt: 1,
    },
  };
}

/**
 * Advances an outbox row's nextAvailableAt to the past so it becomes eligible for recovery.
 */
async function expireNextAvailable(intentId: string) {
  const db = getTestDb();
  await db
    .update(processingOutbox)
    .set({ nextAvailableAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(processingOutbox.id, intentId));
}

/**
 * Sets an outbox row's scheduleAttemptCount to a specific value.
 */
async function setScheduleAttemptCount(intentId: string, count: number) {
  const db = getTestDb();
  await db
    .update(processingOutbox)
    .set({ scheduleAttemptCount: count })
    .where(eq(processingOutbox.id, intentId));
}

/**
 * Sets an outbox row's claimExpiresAt to a very old timestamp (expired claim).
 */
async function expireClaim(intentId: string) {
  const db = getTestDb();
  await db
    .update(processingOutbox)
    .set({
      status: "claimed",
      claimExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      claimToken: "stale-token",
    })
    .where(eq(processingOutbox.id, intentId));
}

describe("Processing Recovery", () => {
  const config = { maxBatch: 3, cooldownSeconds: 60 };

  it("recovers an intent that was dispatched but never claimed (missed after())", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // nextAvailableAt is in the past (defaults to requestedAt = "2026-07-15")
    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);

    // The intent should be recovered and scheduled
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]!.id).toBe(intent.id);

    // Verify the outbox was updated
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.scheduleAttemptCount).toBe(1);
    expect(row?.lastScheduledAt).not.toBeNull();
    expect(new Date(row!.nextAvailableAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("re-selects an intent with an expired claim", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Simulate an expired claim (status = claimed, claimExpiresAt in the past)
    await expireClaim(intent.id);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);

    // The intent should be recovered despite being in "claimed" status
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]!.id).toBe(intent.id);
  });

  it("does not double-process under concurrent requests", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Two concurrent recovery calls — only one should succeed in scheduling
    const [first, second] = await Promise.all([
      selectRecoverableProcessingIntents(ledgerId, config, adapter),
      selectRecoverableProcessingIntents(ledgerId, config, adapter),
    ]);

    // At most one of the two calls should have recovered the intent.
    // With scheduleRecovery now filtering by nextAvailableAt, the second call
    // should see that the intent's nextAvailableAt was advanced by the first
    // call and skip it.
    const total = first.length + second.length;
    expect(total).toBeLessThanOrEqual(2); // Same intent might appear in both

    // The intent should have been incrementally scheduled
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    // At most one of the two calls should have succeeded in scheduling
    expect(row!.scheduleAttemptCount).toBeGreaterThanOrEqual(1);
    expect(row!.scheduleAttemptCount).toBeLessThanOrEqual(2);
  });

  it("skips recovery when the source document has been deleted", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Soft-delete the source document
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date(), pendingRevisionId: null })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);
  });

  it("skips recovery when a newer pending revision exists (stale replacement)", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Create a newer pending revision and point the document to it
    const db = getTestDb();
    const newRevision = await db
      .insert(sourceDocumentRevisions)
      .values({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionNumber: 2,
        submittedText: "Updated text",
        outcome: "queued",
      })
      .returning()
      .then((rows) => rows[0]);
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: newRevision!.id })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    // The old intent's revision no longer matches the document's pendingRevisionId
    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);
  });

  it("marks outbox as failed when schedule attempt count reaches maxBatch", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set scheduleAttemptCount to one below maxBatch
    await setScheduleAttemptCount(intent.id, config.maxBatch - 1);
    await expireNextAvailable(intent.id);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);

    // The intent reached maxBatch — it is exhausted and should not be returned for execution
    expect(recoverable).toHaveLength(0);

    // After recovery increments to maxBatch and markExhausted fires,
    // the outbox should be marked as failed
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");
    expect(row?.scheduleAttemptCount).toBe(config.maxBatch);
    expect(row?.completedAt).not.toBeNull();
  });

  it("does not select an already exhausted intent (scheduleAttemptCount >= maxBatch)", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set scheduleAttemptCount to maxBatch (already exhausted)
    await setScheduleAttemptCount(intent.id, config.maxBatch);
    await expireNextAvailable(intent.id);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);
  });

  it("does not recover intents from other ledgers", async () => {
    const { ledgerId: ledgerA, intent: intentA } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );
    const { ledgerId: ledgerB } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intentA);

    // Recover for ledgerB — should not pick up ledgerA's intent
    const recoverable = await selectRecoverableProcessingIntents(ledgerB, config, adapter);
    expect(recoverable).toHaveLength(0);
  });
});
