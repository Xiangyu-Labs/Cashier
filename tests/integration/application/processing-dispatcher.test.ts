import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  CurrentRevisionProcessor,
  executeSingleProcessingIntent,
  InProcessProcessingDispatcher,
} from "@/application/adapters/in-process";
import {
  PostgresProcessingIntentAdapter,
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import type { ProcessingIntentContract } from "@/application/contracts";
import {
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

vi.mock("@/lib/tasks/ai-context", () => ({
  createAIContext: vi.fn(),
}));
import { createAIContext } from "@/lib/tasks/ai-context";

/**
 * Creates a pending revision + intent for a single source document.
 * Each call uses a fresh user+ledger pair to avoid unique-constraint collisions
 * when called multiple times within one test.
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

describe("SQLite processing intents and in-process dispatcher", () => {
  it("processes parser, reconciliation, exchange-rate facts, and result writes by revision identity", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: 12.5, currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: 12.5,
            currency: "CNY",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "single item",
      }),
    }));
    const processor = new CurrentRevisionProcessor({
      createAIContext: () => ({ generate }),
    });

    await expect(
      processor.process({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionId: intent.revisionId,
      })
    ).resolves.toEqual({ outcome: "completed" });
    await expect(
      processor.process({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionId: intent.revisionId,
      })
    ).resolves.toEqual({ outcome: "completed" });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
    await expect(postgresRevisionAdapter.get(ledgerId, intent.sourceDocumentId)).resolves.toMatchObject(
      {
        activeRevisionId: intent.revisionId,
        pendingRevisionId: null,
      }
    );
  });

  it("deduplicates dispatch and permits only one concurrent claim", async () => {
    const db = getTestDb();
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();

    await Promise.all([adapter.dispatch(intent), adapter.dispatch(intent)]);
    const claims = await Promise.all([adapter.claim(intent.id), adapter.claim(intent.id)]);

    expect(claims.filter((claim) => claim != null)).toHaveLength(1);
    expect(await db.select().from(processingOutbox)).toHaveLength(1);
    expect(await db.select().from(processingAttempts)).toHaveLength(1);
  });

  it("reclaims an expired lease and rejects stale completion", async () => {
    let now = new Date("2026-07-15T00:00:00.000Z");
    const { intent } = await pendingIntent(now.toISOString(), crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter({ leaseMs: 1_000, now: () => now });
    await adapter.dispatch(intent);

    const first = await adapter.claim(intent.id);
    expect(first).not.toBeNull();
    now = new Date(now.getTime() + 1_001);
    const second = await adapter.claim(intent.id);
    expect(second).not.toBeNull();
    expect(second!.claimToken).not.toBe(first!.claimToken);

    await expect(
      adapter.complete({
        intentId: intent.id,
        claimToken: first!.claimToken,
        outcome: "completed",
      })
    ).resolves.toBe(false);
    await expect(
      adapter.complete({
        intentId: intent.id,
        claimToken: second!.claimToken,
        outcome: "anomaly",
      })
    ).resolves.toBe(true);
  });

  it("recovers after dispatcher restart and projects the ledger exactly once", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const durableStore = new PostgresProcessingIntentAdapter();
    await durableStore.dispatch(intent);
    const execute = vi.fn(async () => {
      const activated = await postgresLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionId: intent.revisionId,
        title: "Lunch",
        entries: [
          {
            categoryId: null,
            amount: "12.50",
            currency: "CNY",
            itemName: "Lunch",
            description: null,
            convertedAmount: "12.50",
            exchangeRate: "1",
          },
        ],
      });
      expect(activated).toBe(true);
      return { outcome: "completed" as const };
    });

    await new InProcessProcessingDispatcher(
      new PostgresProcessingIntentAdapter(),
      execute
    ).start();
    await new InProcessProcessingDispatcher(
      new PostgresProcessingIntentAdapter(),
      execute
    ).start();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
    expect(
      await db.query.processingOutbox.findFirst({
        where: eq(processingOutbox.id, intent.id),
      })
    ).toMatchObject({ status: "completed" });
  });
});

describe("executeSingleIntent — request-bound processing seam", () => {
  it("processes only its supplied intent, not unrelated pending rows", async () => {
    const db = getTestDb();
    const entity1 = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const entity2 = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(entity1.intent);
    await adapter.dispatch(entity2.intent);

    const processed: string[] = [];
    const execute = vi.fn(async (claim) => {
      processed.push(claim.intent.id);
      return { outcome: "completed" as const };
    });

    const dispatcher = new InProcessProcessingDispatcher(adapter, execute);
    const result = await dispatcher.executeSingleIntent(entity1.intent);

    // Only intent1 was claimed and processed
    expect(result).toBe(true);
    expect(processed).toEqual([entity1.intent.id]);

    const row1 = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, entity1.intent.id),
    });
    expect(row1?.status).toBe("completed");

    // intent2 remains pending — executeSingleIntent did NOT drain unrelated rows
    const row2 = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, entity2.intent.id),
    });
    expect(row2?.status).toBe("pending");
  });

  it("returns false on duplicate execution (second call is a no-op)", async () => {
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const execute = vi.fn(async () => ({ outcome: "completed" as const }));
    const dispatcher = new InProcessProcessingDispatcher(adapter, execute);

    // First call processes the intent
    const first = await dispatcher.executeSingleIntent(intent);
    expect(first).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);

    // Second call — intent already completed — returns false
    const second = await dispatcher.executeSingleIntent(intent);
    expect(second).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns false on duplicate execution when already claimed by another dispatcher instance", async () => {
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const executeFirst = vi.fn(async () => ({ outcome: "completed" as const }));
    const dispatcher1 = new InProcessProcessingDispatcher(adapter, executeFirst);
    await dispatcher1.executeSingleIntent(intent);

    // Second dispatcher (fresh adapter sharing same DB) tries to claim it
    const adapter2 = new PostgresProcessingIntentAdapter();
    const executeSecond = vi.fn(async () => ({ outcome: "completed" as const }));
    const dispatcher2 = new InProcessProcessingDispatcher(adapter2, executeSecond);
    const result = await dispatcher2.executeSingleIntent(intent);

    expect(result).toBe(false);
    expect(executeSecond).not.toHaveBeenCalled();
  });

  it("records failed outcome when processing throws", async () => {
    const db = getTestDb();
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const execute = vi.fn(async () => {
      throw new Error("AI service unavailable");
    });
    const dispatcher = new InProcessProcessingDispatcher(adapter, execute);
    const result = await dispatcher.executeSingleIntent(intent);

    // Intent was claimed and attempted — returns true even though processing failed
    expect(result).toBe(true);

    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");

    // Verify execution was called
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("preserves terminal outcome when processor rejects a stale revision", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();

    // Dispatch the intent
    await adapter.dispatch(intent);

    // At this point the document has pendingRevisionId = intent.revisionId.
    // We simulate a race: while this intent is pending (in the outbox), another
    // process updates the pendingRevisionId to a different value.
    // We do this by manually setting pendingRevisionId before the executor runs.
    const staleRevisionId = crypto.randomUUID();
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: staleRevisionId })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    // Verify staleness is in place
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, intent.sourceDocumentId),
    });
    expect(doc?.pendingRevisionId).toBe(staleRevisionId);

    // Now executeSingleIntent claims the intent by ID (succeeds — outbox is pending)
    // and the executor calls processor.process(). The processor checks
    // document.pendingRevisionId !== request.revisionId and throws.
    const generate = vi.fn();
    const staleExecutor = vi.fn(async (claim) => {
      const processor = new CurrentRevisionProcessor({
        createAIContext: () => ({ generate }),
      });
      return processor.process({
        ledgerId,
        sourceDocumentId: intent.sourceDocumentId,
        revisionId: intent.revisionId,
      });
    });

    const dispatcher = new InProcessProcessingDispatcher(adapter, staleExecutor);
    const result = await dispatcher.executeSingleIntent(intent);

    // The intent was claimed and the processor threw.
    // executeSingleIntent catches the error and completes with "failed".
    expect(result).toBe(true);

    // The outbox row should be marked as failed
    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");

    // The original revision stays as "processing" because after the claim updated it
    // to "processing", preserveTerminalOutcome's guard (pendingRevisionId check)
    // prevents further updates — the revision is no longer the document's pending one.
    // This orphaned status is harmless: the document points to a different pending
    // revision, and the outbox is already marked failed.
    const r1 = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(r1?.outcome).toBe("processing");

    // activateRevision was never called — verify no ledger entries
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("executeSingleProcessingIntent — standalone function with real adapter/processor", () => {
  it("processes successfully, setting outbox and revision outcomes to completed", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: 12.5, currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: 12.5,
            currency: "CNY",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "single item",
      }),
    }));
    vi.mocked(createAIContext).mockReturnValue({ generate });

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const result = await executeSingleProcessingIntent(intent);
    expect(result).toBe(true);

    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("completed");

    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, intent.sourceDocumentId),
    });
    expect(doc?.activeRevisionId).toBe(intent.revisionId);
    expect(doc?.pendingRevisionId).toBeNull();

    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revision?.outcome).toBe("completed");

    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
  });

  it("handles processing failure: preserveTerminalOutcome guard on stale revision", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    const generate = vi.fn().mockRejectedValue(new Error("AI service unavailable"));
    vi.mocked(createAIContext).mockReturnValue({ generate });

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Simulate stale revision: change pendingRevisionId so preserveTerminalOutcome guard fails
    const staleRevisionId = crypto.randomUUID();
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: staleRevisionId })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    const result = await executeSingleProcessingIntent(intent);
    expect(result).toBe(true);

    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");

    // preserveTerminalOutcome guard prevented update — revision stays at "processing"
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revision?.outcome).toBe("processing");

    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });
});
