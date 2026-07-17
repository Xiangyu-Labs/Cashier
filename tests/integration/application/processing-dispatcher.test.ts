import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  CurrentRevisionProcessor,
  InProcessProcessingDispatcher,
} from "@/application/adapters/in-process";
import {
  PostgresProcessingIntentAdapter,
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import type { ProcessingIntentContract } from "@/application/contracts";
import { ledgerEntries, processingAttempts, processingOutbox } from "@/persistence";

async function pendingIntent(
  requestedAt = "2026-07-15T00:00:00.000Z"
): Promise<{ ledgerId: string; intent: ProcessingIntentContract }> {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db);
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
    const { ledgerId, intent } = await pendingIntent();
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
    const { intent } = await pendingIntent();
    const adapter = new PostgresProcessingIntentAdapter();

    await Promise.all([adapter.dispatch(intent), adapter.dispatch(intent)]);
    const claims = await Promise.all([adapter.claim(intent.id), adapter.claim(intent.id)]);

    expect(claims.filter((claim) => claim != null)).toHaveLength(1);
    expect(await db.select().from(processingOutbox)).toHaveLength(1);
    expect(await db.select().from(processingAttempts)).toHaveLength(1);
  });

  it("reclaims an expired lease and rejects stale completion", async () => {
    let now = new Date("2026-07-15T00:00:00.000Z");
    const { intent } = await pendingIntent(now.toISOString());
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
    const { ledgerId, intent } = await pendingIntent();
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
