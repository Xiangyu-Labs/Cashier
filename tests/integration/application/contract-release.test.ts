import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  sqliteLedgerProjectionAdapter,
  sqliteRevisionAdapter,
  sqliteSourceDocumentSubmissionAdapter,
  getTargetSourceDocument,
} from "@/application/adapters/sqlite";
import {
  ledgerEntries,
  processingOutbox,
  revisionEntries,
  sourceDocuments,
  taskRuns,
} from "@/persistence";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

const projectionEntry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

function legacyFields(row: typeof sourceDocuments.$inferSelect) {
  return {
    text: row.text,
    imageUrls: row.imageUrls,
    status: row.status,
    anomalyReason: row.anomalyReason,
    metadata: row.metadata,
  };
}

describe("local contract release", () => {
  it("writes only target revision, processing, and ledger projections", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const pending = await sqliteSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "Lunch 12.50",
    });
    const created = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    expect(created).not.toBeNull();
    const compatibilityBaseline = legacyFields(created!);
    expect(compatibilityBaseline).toEqual({
      text: null,
      imageUrls: [],
      status: "queued",
      anomalyReason: null,
      metadata: {},
    });

    await sqliteRevisionAdapter.markProcessing({
      ledgerId,
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
    });
    await expect(
      sqliteLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: pending.document.id,
        revisionId: pending.revision.id,
        title: "Target title",
        entries: [projectionEntry],
      })
    ).resolves.toBe(true);

    const completed = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    expect(legacyFields(completed!)).toEqual(compatibilityBaseline);
    expect(completed).toMatchObject({
      activeRevisionId: pending.revision.id,
      pendingRevisionId: null,
      title: "Target title",
    });
    expect(await db.select().from(processingOutbox)).toHaveLength(1);
    expect(await db.select().from(revisionEntries)).toHaveLength(1);
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
  });

  it("leaves retained legacy rows and task history unchanged", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const legacyDocumentId = crypto.randomUUID();
    const legacyTaskId = crypto.randomUUID();
    await db.insert(sourceDocuments).values({
      id: legacyDocumentId,
      ledgerId,
      text: "recovery evidence",
      imageUrls: [`/api/uploads/${ledgerId}/${legacyDocumentId}/receipt.jpg`],
      status: "deleted",
      anomalyReason: "retained anomaly",
      metadata: { originalImageUrls: ["retained-original.jpg"] },
      deletedAt: new Date("2026-07-16T00:00:00.000Z"),
    });
    await db.insert(taskRuns).values({
      id: legacyTaskId,
      type: "parse_source_document",
      title: "Retained task history",
      input: { sourceDocumentId: legacyDocumentId },
      status: "completed",
      entityType: "source_document",
      entityId: legacyDocumentId,
    });
    const beforeDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, legacyDocumentId),
    });
    const beforeTask = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, legacyTaskId) });

    await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Target-only entry",
      entries: [projectionEntry],
    });

    expect(
      await db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, legacyDocumentId) })
    ).toEqual(beforeDocument);
    expect(await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, legacyTaskId) })).toEqual(
      beforeTask
    );
  });

  it("derives reads from revisions instead of the legacy status column", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      submittedText: "target revision text",
      entries: [projectionEntry],
    });
    await db
      .update(sourceDocuments)
      .set({ status: "deleted", text: "legacy text must be ignored" })
      .where(eq(sourceDocuments.id, created.sourceDocumentId));

    await expect(
      getTargetSourceDocument(ledgerId, created.sourceDocumentId)
    ).resolves.toMatchObject({
      id: created.sourceDocumentId,
      status: "completed",
      text: "target revision text",
    });
  });
});
