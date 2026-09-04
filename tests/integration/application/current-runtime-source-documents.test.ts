import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
} from "@/application/adapters/postgres";
import {
  entryCategories,
  ledgerEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";

const projectionEntry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

describe("current-runtime target adapters", () => {
  it("creates, paginates, authorizes, and preserves revision state", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );

    const first = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "first",
    });
    await expect(postgresRevisionAdapter.get(otherLedgerId, first.document.id)).resolves.toBeNull();
    await expect(
      postgresRevisionAdapter.createPending({ ledgerId, sourceDocumentId: first.document.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      postgresRevisionAdapter.markProcessing({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: first.revision.id,
      })
    ).resolves.toBe(true);
    await expect(
      postgresRevisionAdapter.preserveTerminalOutcome({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: first.revision.id,
        outcome: "failed",
        failureCode: "PROCESSING_UNAVAILABLE",
      })
    ).resolves.toBe(true);

    const retry = await postgresRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: first.document.id,
      submittedText: "retry",
    });
    await postgresRevisionAdapter.markProcessing({
      ledgerId,
      sourceDocumentId: first.document.id,
      revisionId: retry.revision.id,
    });
    await expect(
      postgresLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: retry.revision.id,
        entries: [projectionEntry],
      })
    ).resolves.toBe(true);

    const failedRetry = await postgresRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: first.document.id,
      submittedText: "bad retry",
    });
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: first.document.id,
      revisionId: failedRetry.revision.id,
      outcome: "anomaly",
      anomalyReason: "unreadable",
    });
    const preserved = await postgresRevisionAdapter.get(ledgerId, first.document.id);
    expect(preserved).toMatchObject({
      activeRevisionId: retry.revision.id,
      pendingRevisionId: failedRetry.revision.id,
    });

    const second = await postgresRevisionAdapter.createPending({
      ledgerId,
      submittedText: "second",
    });
    const page1 = await postgresRevisionAdapter.list({ ledgerId, limit: 1 });
    const page2 = await postgresRevisionAdapter.list({
      ledgerId,
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect([page1.items[0]?.id, page2.items[0]?.id].sort()).toEqual(
      [first.document.id, second.document.id].sort()
    );
  });

  it("rolls back activation when a projection violates ledger ownership", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    const [otherCategory] = await db
      .insert(entryCategories)
      .values({ ledgerId: otherLedgerId, name: "Other" })
      .returning();
    const pending = await postgresRevisionAdapter.createPending({ ledgerId });

    await expect(
      postgresLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: pending.document.id,
        revisionId: pending.revision.id,
        entries: [{ ...projectionEntry, categoryId: otherCategory!.id }],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, pending.revision.id),
    });
    expect(document).toMatchObject({
      activeRevisionId: null,
      pendingRevisionId: pending.revision.id,
    });
    expect(revision?.outcome).toBe("processing");
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("never creates target projections for an already-deleted legacy bill", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [legacy] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "completed",
        deletedAt: new Date(),
      })
      .returning();

    await expect(
      postgresRevisionAdapter.createPending({ ledgerId, sourceDocumentId: legacy!.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(0);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("soft deletes active and pending documents without removing evidence or accepting late completion", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await postgresLedgerProjectionAdapter.createManual({
      expectedMainCurrency: "CNY",
      ledgerId,
      entries: [projectionEntry],
    });
    const [file] = await db
      .insert(storedFiles)
      .values({
        ledgerId,
        storageProvider: "local",
        storageKey: `${ledgerId}/stored/pending-evidence`,
        contentType: "image/jpeg",
        byteSize: 7,
        finalizedAt: new Date(),
      })
      .returning();
    const pending = await postgresRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      storedFileIds: [file!.id],
    });
    expect(pending.document.supportedActions).toEqual([
      "cancel_processing",
      "retry",
      "edit_retry",
      "delete",
    ]);
    const revisionCount = (await db.select().from(sourceDocumentRevisions)).length;
    const fileLinkCount = (await db.select().from(revisionFiles)).length;

    await expect(
      deleteSourceDocument(
        { ledgerId, sourceDocumentId: active.sourceDocumentId },
        postgresRevisionAdapter
      )
    ).resolves.toEqual({ sourceDocumentId: active.sourceDocumentId, deleted: true });
    await expect(
      deleteSourceDocument(
        { ledgerId, sourceDocumentId: active.sourceDocumentId },
        postgresRevisionAdapter
      )
    ).resolves.toEqual({ sourceDocumentId: active.sourceDocumentId, deleted: false });
    await expect(
      postgresLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: pending.revision.id,
        entries: [{ ...projectionEntry, amount: "99.00" }],
      })
    ).resolves.toBe(false);
    await expect(
      postgresRevisionAdapter.markProcessing({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: pending.revision.id,
      })
    ).resolves.toBe(false);

    const deleted = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.sourceDocumentId),
    });
    expect(deleted).toMatchObject({
      currentStatus: "cancelled",
      deletedAt: expect.any(Date),
      activeRevisionId: active.revisionId,
      pendingRevisionId: null,
    });
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(revisionCount);
    expect(await db.select().from(revisionFiles)).toHaveLength(fileLinkCount);
    expect(await db.select().from(storedFiles)).toHaveLength(1);
    expect(
      await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.sourceDocumentId, active.sourceDocumentId),
      })
    ).toMatchObject({ deletedAt: expect.any(Date) });
  });
});
