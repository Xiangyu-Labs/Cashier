import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { executeSingleProcessingIntent } from "@/application/adapters/in-process";
import {
  PostgresProcessingIntentAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import type { ProcessingIntentContract } from "@/application/contracts";
import {
  ledgerEntries,
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
    expect(doc?.stateVersion).toBe(2);

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
