import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { CurrentRevisionProcessor } from "@/application/adapters/in-process";
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
