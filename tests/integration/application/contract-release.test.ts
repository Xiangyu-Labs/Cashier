import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  getTargetSourceDocument,
} from "@/application/adapters/postgres";
import {
  ledgerEntries,
  processingOutbox,
  revisionEntries,
  sourceDocuments,
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
    const pending = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
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
      status: "processing",
      anomalyReason: null,
      metadata: {},
    });

    await postgresRevisionAdapter.markProcessing({
      ledgerId,
      sourceDocumentId: pending.document.id,
      revisionId: pending.revision.id,
    });
    await expect(
      postgresLedgerProjectionAdapter.activateRevision({
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

  it("leaves retained legacy rows unchanged", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const legacyDocumentId = crypto.randomUUID();
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
    const beforeDocument = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, legacyDocumentId),
    });

    await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Target-only entry",
      entries: [projectionEntry],
    });

    expect(
      await db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, legacyDocumentId) })
    ).toEqual(beforeDocument);
  });

  it("derives reads from revisions instead of the legacy status column", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const created = await postgresLedgerProjectionAdapter.createManual({
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
