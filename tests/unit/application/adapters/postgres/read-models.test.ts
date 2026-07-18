import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import { countSourceDocumentsByStatus } from "@/application/adapters/postgres/read-models";
import { createTestUserWithLedger } from "../../../../helpers/schema-setup";
import { getTestDb } from "../../../../setup";
import { sourceDocuments, sourceDocumentRevisions } from "@/persistence";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";

describe("countSourceDocumentsByStatus", () => {
  it("returns zero counts for an empty ledger", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);

    const result = await countSourceDocumentsByStatus(ledgerId);

    expect(result).toEqual({
      processingCount: 0,
      attentionCount: 0,
    });
  });

  it("counts queued and processing documents as processingCount", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const now = new Date();

    // Helper to create a document with an active revision
    async function insertWithStatus(status: SourceDocumentStatusType, overrideDeletedAt?: Date) {
      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId,
          title: `${status} receipt`,
          text: null,
          status,
          entryDate: "2026-07-15",
          createdAt: now,
          updatedAt: now,
          deletedAt: overrideDeletedAt ?? null,
        })
        .returning();
      // Create a revision for this document so the derived status expression resolves
      const outcome =
        status === "queued" ? "queued"
        : status === "processing" ? "processing"
        : status === "anomaly" ? "anomaly"
        : status === "failed" ? "failed"
        : "completed";
      const [revision] = await db
        .insert(sourceDocumentRevisions)
        .values({
          ledgerId,
          sourceDocumentId: doc!.id,
          revisionNumber: 1,
          submittedText: null,
          outcome,
          finalizedAt: outcome === "queued" || outcome === "processing" || status === "candidate_pending" ? null : now,
        })
        .returning();
      await db
        .update(sourceDocuments)
        .set({ pendingRevisionId: revision!.id })
        .where(eq(sourceDocuments.id, doc!.id));
      return doc!;
    }

    await insertWithStatus("queued");
    await insertWithStatus("processing");
    await insertWithStatus("anomaly"); // should NOT be in processingCount

    const result = await countSourceDocumentsByStatus(ledgerId);

    expect(result.processingCount).toBe(2);
    expect(result.attentionCount).toBe(1);
  });

  it("counts candidate_pending, anomaly, and failed as attentionCount", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const now = new Date();

    // Create a candidate_pending document (needs both active and pending revisions)
    const [candidateDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        title: "candidate_pending document",
        text: null,
        status: "completed",
        entryDate: "2026-07-15",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    const [activeRev] = await db
      .insert(sourceDocumentRevisions)
      .values({
        ledgerId,
        sourceDocumentId: candidateDoc!.id,
        revisionNumber: 1,
        submittedText: null,
        outcome: "completed",
        finalizedAt: now,
      })
      .returning();

    const [pendingRev] = await db
      .insert(sourceDocumentRevisions)
      .values({
        ledgerId,
        sourceDocumentId: candidateDoc!.id,
        revisionNumber: 2,
        submittedText: null,
        outcome: "completed",
        finalizedAt: null,
      })
      .returning();

    await db
      .update(sourceDocuments)
      .set({ activeRevisionId: activeRev!.id, pendingRevisionId: pendingRev!.id })
      .where(eq(sourceDocuments.id, candidateDoc!.id));

    // Create anomaly and failed documents
    for (const status of ["anomaly", "failed"] as const) {
      const [doc] = await db
        .insert(sourceDocuments)
        .values({
          ledgerId,
          title: `${status} document`,
          text: null,
          status,
          entryDate: "2026-07-15",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .returning();

      const [revision] = await db
        .insert(sourceDocumentRevisions)
        .values({
          ledgerId,
          sourceDocumentId: doc!.id,
          revisionNumber: 1,
          submittedText: null,
          outcome: status,
          finalizedAt: now,
        })
        .returning();

      await db
        .update(sourceDocuments)
        .set({ pendingRevisionId: revision!.id })
        .where(eq(sourceDocuments.id, doc!.id));
    }

    const result = await countSourceDocumentsByStatus(ledgerId);

    // processing = 0, attention = 3 (candidate_pending + anomaly + failed)
    expect(result.processingCount).toBe(0);
    expect(result.attentionCount).toBe(3);
  });

  it("excludes soft-deleted documents from counts", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const now = new Date();

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        title: "Deleted anomaly",
        text: null,
        status: "anomaly",
        entryDate: "2026-07-15",
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      })
      .returning();

    const [revision] = await db
      .insert(sourceDocumentRevisions)
      .values({
        ledgerId,
        sourceDocumentId: doc!.id,
        revisionNumber: 1,
        submittedText: null,
        outcome: "anomaly",
        finalizedAt: now,
      })
      .returning();

    await db
      .update(sourceDocuments)
      .set({ pendingRevisionId: revision!.id })
      .where(eq(sourceDocuments.id, doc!.id));

    const result = await countSourceDocumentsByStatus(ledgerId);

    expect(result.attentionCount).toBe(0);
  });
});
