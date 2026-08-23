import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  CurrentRevisionProcessor,
  executeSingleProcessingIntent,
} from "@/application/adapters/in-process";
import {
  PostgresProcessingIntentAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import { serverComposition } from "@/application/server-composition-root";
import type { ProcessingIntentContract } from "@/application/contracts";
import {
  ledgerEntries,
  ledgers,
  duplicateReviews,
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

vi.mock("@/lib/tasks/ai-context", () => ({
  createAIContext: vi.fn(),
}));
import { createAIContext } from "@/lib/tasks/ai-context";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

describe("PostgresProcessingIntentAdapter", () => {
  it("processes parser, reconciliation, exchange-rate facts, and result writes by revision identity", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );
    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
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
    await expect(
      postgresRevisionAdapter.get(ledgerId, intent.sourceDocumentId)
    ).resolves.toMatchObject({
      activeRevisionId: intent.revisionId,
      pendingRevisionId: null,
    });
  });

  it("processes with custom ledger prompt in AI generation request", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );

    // Update typed ledger settings with a custom prompt.
    const customPrompt = "Please categorize expenses as food or transport";
    await db
      .update(ledgers)
      .set({
        aiCustomPrompt: customPrompt,
        aiLanguage: "en",
        preferredCurrencies: ["CNY", "USD"],
      })
      .where(eq(ledgers.id, ledgerId));

    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
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

    await processor.process({
      ledgerId,
      sourceDocumentId: intent.sourceDocumentId,
      revisionId: intent.revisionId,
    });

    // Verify the custom prompt reaches the AI call
    expect(generate).toHaveBeenCalled();
    const callArgs = (generate.mock.calls as unknown[][]).reduce(
      (acc, call) => acc + JSON.stringify(call),
      ""
    );
    expect(callArgs).toContain(customPrompt);
  });

  it("skips duplicate candidates, images, and AI when detection is disabled", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    await db
      .update(ledgers)
      .set({ duplicateDetectionEnabled: false })
      .where(eq(ledgers.id, ledgerId));
    await serverComposition.ledgerProjections.createManual({
      expectedMainCurrency: "CNY",
      ledgerId,
      title: "Existing bill",
      entryDate: "2026-07-15",
      submittedText: null,
      entries: [
        {
          categoryId: null,
          amount: "12.50",
          currency: "CNY",
          itemName: "Lunch",
          description: null,
          convertedAmount: "12.50",
          exchangeRate: "1.000000",
        },
      ],
    });
    const pending = await postgresRevisionAdapter.createPending({
      ledgerId,
      entryDate: "2026-07-15",
      submittedText: "Lunch 12.50 CNY",
    });
    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
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

    await processor.process({
      ledgerId,
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      await db.query.duplicateReviews.findFirst({
        where: eq(duplicateReviews.sourceDocumentId, pending.document.id),
      })
    ).toBeUndefined();
    await expect(postgresRevisionAdapter.get(ledgerId, pending.document.id)).resolves.toMatchObject(
      {
        activeRevisionId: pending.revision.id,
        pendingRevisionId: null,
      }
    );
  });

  it("retried revision uses current ledger settings", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );

    // Process once without custom prompt (successful first parse)
    const generate1 = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
            currency: "CNY",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "single item",
      }),
    }));

    const processor1 = new CurrentRevisionProcessor({
      createAIContext: () => ({ generate: generate1 }),
    });

    await processor1.process({
      ledgerId,
      sourceDocumentId: intent.sourceDocumentId,
      revisionId: intent.revisionId,
    });

    // Update typed settings after the first parse.
    const customPrompt = "Please focus on categorizing dining expenses";
    await db
      .update(ledgers)
      .set({
        aiCustomPrompt: customPrompt,
        aiLanguage: "en",
        preferredCurrencies: ["CNY", "USD"],
      })
      .where(eq(ledgers.id, ledgerId));

    // Create a second revision (retry) after the settings change
    const pending2 = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "Dinner 25.00 USD",
    });

    const generate2 = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Dinner",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "25.00", currency: "USD" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Dinner",
            amount: "25.00",
            currency: "USD",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "single item",
      }),
    }));

    const processor2 = new CurrentRevisionProcessor({
      createAIContext: () => ({ generate: generate2 }),
    });

    await processor2.process({
      ledgerId,
      sourceDocumentId: pending2.document.id,
      revisionId: pending2.revision.id,
    });

    // Verify the new AI call used the updated custom prompt
    expect(generate2).toHaveBeenCalled();
    const callArgs = (generate2.mock.calls as unknown[][]).reduce(
      (acc, call) => acc + JSON.stringify(call),
      ""
    );
    expect(callArgs).toContain(customPrompt);
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
    now = new Date(now.getTime() + 500);
    const renewedUntil = await adapter.renew(intent.id, first!.claimToken);
    expect(renewedUntil).toBe(new Date(now.getTime() + 1_000).toISOString());
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

  it("returns false on duplicate claim", async () => {
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // First claim succeeds
    const first = await adapter.claim(intent.id);
    expect(first).not.toBeNull();

    // Second claim (same adapter, same DB) returns null since intent is claimed
    const second = await adapter.claim(intent.id);
    expect(second).toBeNull();
  });

  it("records failed outcome on processing error via executeSingleProcessingIntent", async () => {
    const db = getTestDb();
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    const generate = vi.fn().mockRejectedValue(new Error("AI service unavailable"));
    vi.mocked(createAIContext).mockReturnValue({ generate });

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const result = await executeSingleProcessingIntent(intent);
    expect(result).toBe(true);

    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("failed");
  });
});

describe("leased processor fencing", () => {
  async function reclaimedLease(intent: ProcessingIntentContract) {
    const db = getTestDb();
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);
    const first = await adapter.claim(intent.id);
    expect(first).not.toBeNull();
    // Expire the first claim and let a second worker reclaim the outbox row.
    await db
      .update(processingOutbox)
      .set({ claimExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(processingOutbox.id, intent.id));
    const second = await adapter.claim(intent.id);
    expect(second).not.toBeNull();
    return { adapter, firstToken: first!.claimToken, secondToken: second!.claimToken };
  }

  it("does not commit a projection after the worker lease is reclaimed", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );
    const { firstToken } = await reclaimedLease(intent);

    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
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
        lease: { intentId: intent.id, claimToken: firstToken },
      })
    ).rejects.toThrow("Processing cancelled");

    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, intent.sourceDocumentId),
    });
    expect(revision?.outcome).toBe("processing");
    expect(document?.activeRevisionId).toBeNull();
    expect(document?.pendingRevisionId).toBe(intent.revisionId);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("does not persist a terminal outcome after the worker lease is reclaimed", async () => {
    const db = getTestDb();
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );
    const { firstToken } = await reclaimedLease(intent);

    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "anomaly",
        anomaly_reason: "Image too blurry",
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
            currency: "CNY",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "blurry image",
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
        lease: { intentId: intent.id, claimToken: firstToken },
      })
    ).rejects.toThrow("Processing cancelled");

    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revision?.outcome).toBe("processing");
    expect(revision?.anomalyReason).toBeNull();
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });
});

describe("executeSingleProcessingIntent — standalone function with real adapter/processor", () => {
  it.each([
    ["returns null", "null"],
    ["throws", "throw"],
  ] as const)("aborts the worker when lease renewal %s", async (_label, mode) => {
    vi.useFakeTimers();
    const db = getTestDb();
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    let releaseGeneration!: (value: { content: string }) => void;
    let markGenerationStarted!: () => void;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const generation = new Promise<{ content: string }>((resolve) => {
      releaseGeneration = resolve;
    });
    const generate = vi.fn(() => {
      markGenerationStarted();
      return generation;
    });
    let processingSignal: AbortSignal | undefined;
    vi.mocked(createAIContext).mockImplementation(({ signal }) => {
      processingSignal = signal;
      return { generate };
    });

    const renew = vi
      .spyOn(PostgresProcessingIntentAdapter.prototype, "renew")
      .mockImplementation(async () => {
        if (mode === "null") return null;
        throw new Error("lease backend unavailable");
      });
    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    const execution = executeSingleProcessingIntent(intent);
    await generationStarted;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(renew).toHaveBeenCalledTimes(1);
    expect(processingSignal?.aborted).toBe(true);

    releaseGeneration({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
            currency: "CNY",
            category_index: 0,
            notes: null,
          },
        ],
        order_adjustments: [],
        reasoning: "single item",
      }),
    });

    await expect(execution).resolves.toBe(true);
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, intent.sourceDocumentId),
    });
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(document?.activeRevisionId).toBeNull();
    expect(document?.pendingRevisionId).toBe(intent.revisionId);
    expect(revision?.outcome).toBe("processing");
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("processes successfully, setting outbox and revision outcomes to completed", async () => {
    const db = getTestDb();
    const { intent } = await pendingIntent("2026-07-15T00:00:00.000Z", crypto.randomUUID());

    const generate = vi.fn(async () => ({
      content: JSON.stringify({
        outcome: "success",
        anomaly_reason: null,
        title: "Lunch",
        receipt_count: 1,
        receipt_totals: [{ receipt_index: 0, amount: "12.50", currency: "CNY" }],
        ledger_entries: [
          {
            receipt_index: 0,
            item_name: "Lunch",
            amount: "12.50",
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
    const { ledgerId, intent } = await pendingIntent(
      "2026-07-15T00:00:00.000Z",
      crypto.randomUUID()
    );

    const generate = vi.fn().mockRejectedValue(new Error("AI service unavailable"));
    vi.mocked(createAIContext).mockReturnValue({ generate });

    const adapter = new PostgresProcessingIntentAdapter();
    await adapter.dispatch(intent);

    // Simulate stale revision: change pendingRevisionId so preserveTerminalOutcome guard fails
    const staleRevisionId = crypto.randomUUID();
    await db.insert(sourceDocumentRevisions).values({
      id: staleRevisionId,
      ledgerId,
      sourceDocumentId: intent.sourceDocumentId,
      revisionNumber: 2,
      outcome: "processing",
    });
    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: staleRevisionId })
      .where(eq(sourceDocuments.id, intent.sourceDocumentId));

    const result = await executeSingleProcessingIntent(intent);
    expect(result).toBe(true);

    const row = await db.query.processingOutbox.findFirst({
      where: eq(processingOutbox.id, intent.id),
    });
    expect(row?.status).toBe("claimed");

    // The stale worker cannot terminally update either side; lease recovery owns the retry.
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, intent.revisionId),
    });
    expect(revision?.outcome).toBe("processing");

    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });
});
