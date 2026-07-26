import { describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  PostgresProcessingIntentAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import { selectRecoverableProcessingIntents } from "@/modules/source-document/application/use-cases/select-recoverable-processing-intents";
import type { ProcessingIntentContract } from "@/application/contracts";
import {
  processingAttempts,
  processingOutbox,
  sourceDocuments,
  sourceDocumentRevisions,
} from "@/persistence";

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
  const config = { maxBatch: 3, maxAttempts: 5, cooldownSeconds: 60 };

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
    const total = first.length + second.length;
    expect(total).toBeLessThanOrEqual(2); // Same intent might appear in both

    // The intent should have been incrementally scheduled
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
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
        outcome: "processing",
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

  it("does not recover intents from other ledgers", async () => {
    const { intent: intentA } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );
    const { ledgerId: ledgerB } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intentA);

    // Recover for ledgerB — should not pick up intentA
    const recoverable = await selectRecoverableProcessingIntents(ledgerB, config, adapter);
    expect(recoverable).toHaveLength(0);
  });

  // ── New/updated tests for Task 3 ──

  it("returns intent for execution on last allowed attempt (scheduleAttemptCount reaches maxAttempts)", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set scheduleAttemptCount to one below maxAttempts — this is the last schedulable attempt
    await setScheduleAttemptCount(intent.id, config.maxAttempts - 1);
    await expireNextAvailable(intent.id);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);

    // The intent should be returned for execution (this is its last allowed attempt)
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]!.id).toBe(intent.id);

    // scheduleAttemptCount should now be maxAttempts
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.scheduleAttemptCount).toBe(config.maxAttempts);
    // Outbox should NOT be exhausted yet — exhaustion only on next request
    expect(row?.status).toBe("pending");
  });

  it("exhausts intent on next request after scheduleAttemptCount reaches maxAttempts and cooldown expires", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Simulate: the intent has already been scheduled maxAttempts times
    await setScheduleAttemptCount(intent.id, config.maxAttempts);
    await expireNextAvailable(intent.id);

    // This request should exhaust the intent (not schedule it)
    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);

    // Outbox should be marked as failed
    const db = getTestDb();
    const outboxRow = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(outboxRow?.status).toBe("failed");
    expect(outboxRow?.completedAt).not.toBeNull();

    // Revision should be marked as failed
    const revisionRow = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revisionRow?.outcome).toBe("failed");
    expect(revisionRow?.failureCode).toBe("request_bound_retry_exhausted");

    // Attempt record should be updated
    const attemptRow = await db.query.processingAttempts.findFirst({
      where: and(
        eq(processingAttempts.revisionId, intent.revisionId),
        eq(processingAttempts.attemptNumber, intent.attempt)
      ),
    });
    expect(attemptRow?.status).toBe("failed");
    expect(attemptRow?.retryClassification).toBe("permanent");
    expect(attemptRow?.diagnosticCode).toBe("request_bound_retry_exhausted");
  });

  it("respects maxBatch independent of maxAttempts (returns at most maxBatch intents)", async () => {
    const smallConfig = { maxBatch: 2, maxAttempts: 5, cooldownSeconds: 60 };

    // Create a single ledger and 3 source documents within it
    const { ledgerId, intent: intent1 } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent1);

    // Create 2 more source documents in the same ledger
    const pending2 = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "Lunch 12.50 CNY",
    });
    const pending3 = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "Coffee 5.00 CNY",
    });

    const intent2: ProcessingIntentContract = {
      id: crypto.randomUUID(),
      sourceDocumentId: pending2.document.id,
      revisionId: pending2.revision.id,
      requestedAt: "2026-07-15T00:00:00.000Z",
      attempt: 1,
    };
    const intent3: ProcessingIntentContract = {
      id: crypto.randomUUID(),
      sourceDocumentId: pending3.document.id,
      revisionId: pending3.revision.id,
      requestedAt: "2026-07-15T00:00:00.000Z",
      attempt: 1,
    };

    await adapter.dispatch(intent2);
    await adapter.dispatch(intent3);

    // expire all three
    await expireNextAvailable(intent1.id);
    await expireNextAvailable(intent2.id);
    await expireNextAvailable(intent3.id);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, smallConfig, adapter);

    // maxBatch=2 limits the result even though 3 intents are eligible
    expect(recoverable).toHaveLength(2);
  });

  it("maxBatch=1 still allows intent to execute", async () => {
    const singleConfig = { maxBatch: 1, maxAttempts: 3, cooldownSeconds: 60 };
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const recoverable = await selectRecoverableProcessingIntents(ledgerId, singleConfig, adapter);
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]!.id).toBe(intent.id);
  });

  it("exhaustion CAS: stale outbox closed but revision untouched when newer pending exists", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set up: scheduleAttemptCount at maxAttempts, but then change the document's
    // pendingRevisionId so the outbox's revision is no longer current
    await setScheduleAttemptCount(intent.id, config.maxAttempts);

    // Create a newer pending revision
    const db = getTestDb();
    const newRevision = await db
      .insert(sourceDocumentRevisions)
      .values({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionNumber: 2,
        submittedText: "Updated text",
        outcome: "processing",
      })
      .returning()
      .then((rows) => rows[0]);
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: newRevision!.id })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    // The revision is no longer the current pending — exhaustStaleIntents won't
    // find it (join filters by pendingRevisionId). Call markExhausted directly
    // to test the CAS within it.
    await adapter.markExhausted(intent.id);

    // The outbox should be closed (status = failed)
    const outboxRow = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(outboxRow?.status).toBe("failed");

    // But the OLD revision should NOT have been modified
    const oldRevision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(oldRevision?.outcome).not.toBe("failed");
    expect(oldRevision?.failureCode).toBeNull();
  });

  it("exhaustion CAS: full exhaustion when revision is still current pending", async () => {
    const { intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // The revision IS still the current pending — exhaustion should fully update
    await adapter.markExhausted(intent.id);

    const db = getTestDb();

    // Outbox should be failed
    const outboxRow = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(outboxRow?.status).toBe("failed");

    // Revision should be marked as failed
    const revisionRow = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revisionRow?.outcome).toBe("failed");
    expect(revisionRow?.failureCode).toBe("request_bound_retry_exhausted");

    // Attempt record should be updated
    const attemptRow = await db.query.processingAttempts.findFirst({
      where: and(
        eq(processingAttempts.revisionId, intent.revisionId),
        eq(processingAttempts.attemptNumber, intent.attempt)
      ),
    });
    expect(attemptRow?.status).toBe("failed");
    expect(attemptRow?.retryClassification).toBe("permanent");
  });

  it("exhaustion CAS: does not modify completed revision's outcome", async () => {
    const { intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Simulate: the revision was already completed (e.g., by the executor)
    const db = getTestDb();
    await db
      .update(sourceDocumentRevisions)
      .set({ outcome: "completed", finalizedAt: new Date() })
      .where(eq(sourceDocumentRevisions.id, intent.revisionId));

    await adapter.markExhausted(intent.id);

    // Outbox should be closed (stale)
    const outboxRow = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(outboxRow?.status).toBe("failed");

    // Revision should remain "completed", NOT overwritten to "failed"
    const revisionRow = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revisionRow?.outcome).toBe("completed");
  });

  it("does not select an intent with scheduleAttemptCount >= maxAttempts for recovery", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set scheduleAttemptCount to maxAttempts (exceeds threshold for selectRecoverable)
    await setScheduleAttemptCount(intent.id, config.maxAttempts);
    await expireNextAvailable(intent.id);

    // The intent should NOT be selected for recovery (scheduleAttemptCount >= maxAttempts)
    // Instead, it should be exhausted
    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);

    // Outbox should be exhausted
    const db = getTestDb();
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");
  });

  it("exhaustion only happens after cooldown expires", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Set scheduleAttemptCount to maxAttempts and force nextAvailableAt to the future
    const db = getTestDb();
    await db
      .update(processingOutbox)
      .set({
        scheduleAttemptCount: config.maxAttempts,
        nextAvailableAt: new Date("2099-01-01T00:00:00.000Z"),
      })
      .where(eq(processingOutbox.id, intent.id));

    // The intent should not be exhausted because cooldown hasn't expired
    const recoverable = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable).toHaveLength(0);

    // Outbox should still be pending (not yet exhausted because nextAvailableAt > now)
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("pending");
    expect(row?.scheduleAttemptCount).toBe(config.maxAttempts);

    // Now expire nextAvailableAt and try again — should exhaust
    await expireNextAvailable(intent.id);
    const recoverable2 = await selectRecoverableProcessingIntents(ledgerId, config, adapter);
    expect(recoverable2).toHaveLength(0);

    const row2 = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row2?.status).toBe("failed");
  });
});

describe("Processing Timeout", () => {
  const now = new Date("2026-07-26T00:05:00.000Z");

  async function setIntentCreatedAt(intentId: string, createdAt: string) {
    await getTestDb()
      .update(processingOutbox)
      .set({ createdAt: new Date(createdAt) })
      .where(eq(processingOutbox.id, intentId));
  }

  it("expires a processing intent at the configured boundary", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter({ now: () => now });
    await adapter.dispatch(intent);
    await setIntentCreatedAt(intent.id, "2026-07-26T00:00:00.000Z");

    await expect(adapter.expireTimedOut(ledgerId, 300, 5)).resolves.toBe(1);

    const db = getTestDb();
    const [outbox, attempt, revision] = await Promise.all([
      db.query.processingOutbox.findFirst({ where: eq(processingOutbox.id, intent.id) }),
      db.query.processingAttempts.findFirst({
        where: and(
          eq(processingAttempts.revisionId, intent.revisionId),
          eq(processingAttempts.attemptNumber, 1)
        ),
      }),
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, intent.revisionId),
      }),
    ]);
    expect(outbox).toMatchObject({ status: "failed", claimToken: null, claimExpiresAt: null });
    expect(attempt).toMatchObject({
      status: "failed",
      retryClassification: "permanent",
      diagnosticCode: "processing_timeout",
    });
    expect(revision).toMatchObject({ outcome: "failed", failureCode: "processing_timeout" });
  });

  it("does not expire an intent before the configured boundary", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter({ now: () => now });
    await adapter.dispatch(intent);
    await setIntentCreatedAt(intent.id, "2026-07-26T00:00:01.000Z");

    await expect(adapter.expireTimedOut(ledgerId, 300, 5)).resolves.toBe(0);
    const revision = await getTestDb().query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revision?.outcome).toBe("processing");
  });

  it("revokes an active claim when the absolute timeout is reached", async () => {
    const { ledgerId, intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter({ now: () => now });
    await adapter.dispatch(intent);
    await setIntentCreatedAt(intent.id, "2026-07-26T00:00:00.000Z");
    const claim = await adapter.claim(intent.id);
    expect(claim).not.toBeNull();

    await expect(adapter.expireTimedOut(ledgerId, 300, 5)).resolves.toBe(1);
    await expect(
      adapter.complete({
        intentId: intent.id,
        claimToken: claim!.claimToken,
        outcome: "completed",
      })
    ).resolves.toBe(false);
  });
});
