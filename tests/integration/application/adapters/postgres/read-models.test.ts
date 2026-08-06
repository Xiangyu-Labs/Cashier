import { eq } from "drizzle-orm";
import { describe, it, expect } from "vitest";
import {
  collectTargetSourceDocuments,
  countSourceDocumentsByStatus,
  listTargetSourceDocuments,
} from "@/application/adapters/postgres/read-models";
import { getSourceDocumentAttentionQuery } from "@/modules/source-document/application/queries/get-source-document-attention";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { createTestSourceDocument } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";
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

  it("counts processing documents as processingCount", async () => {
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
          currentStatus: status === "deleted" ? "completed" : status,
          entryDate: "2026-07-15",
          createdAt: now,
          updatedAt: now,
          deletedAt: overrideDeletedAt ?? null,
        })
        .returning();
      // Create a revision for this document so the derived status expression resolves
      const outcome =
        status === "processing"
          ? "processing"
          : status === "anomaly"
            ? "anomaly"
            : status === "failed"
              ? "failed"
              : "completed";
      const [revision] = await db
        .insert(sourceDocumentRevisions)
        .values({
          ledgerId,
          sourceDocumentId: doc!.id,
          revisionNumber: 1,
          submittedText: null,
          outcome,
          finalizedAt: outcome === "processing" || status === "candidate_pending" ? null : now,
        })
        .returning();
      await db
        .update(sourceDocuments)
        .set({ pendingRevisionId: revision!.id })
        .where(eq(sourceDocuments.id, doc!.id));
      return doc!;
    }

    await insertWithStatus("processing");
    await insertWithStatus("anomaly"); // should NOT be in processingCount

    const result = await countSourceDocumentsByStatus(ledgerId);

    expect(result.processingCount).toBe(1);
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
        currentStatus: "completed",
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
          currentStatus: status,
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
        currentStatus: "anomaly",
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

describe("getSourceDocumentAttentionQuery", () => {
  it("returns a bounded page and the full attention total", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);

    for (let index = 0; index < 51; index += 1) {
      await createTestSourceDocument(db, ledgerId, {
        status: "anomaly",
        text: `Anomaly document ${index}`,
      });
    }

    const attention = await getSourceDocumentAttentionQuery(ledgerId, {
      list: listTargetSourceDocuments,
      counts: countSourceDocumentsByStatus,
    });

    expect(attention.items).toHaveLength(50);
    expect(attention.total).toBe(51);
  });

  it("includes processing documents in the attention total", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);

    await createTestSourceDocument(db, ledgerId, { status: "processing" });
    await createTestSourceDocument(db, ledgerId, { status: "processing" });
    await createTestSourceDocument(db, ledgerId, { status: "anomaly" });

    const attention = await getSourceDocumentAttentionQuery(ledgerId, {
      list: listTargetSourceDocuments,
      counts: countSourceDocumentsByStatus,
    });

    expect(attention.items).toHaveLength(3);
    expect(attention.total).toBe(3);
  });
});

describe("collectTargetSourceDocuments", () => {
  it("returns complete file DTOs when includeFiles is enabled", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    await createTestSourceDocument(db, ledgerId, {
      imageUrls: ["receipt.jpg"],
    });

    const result = await collectTargetSourceDocuments({
      ledgerId,
      limit: 20,
      includeFiles: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.files).toHaveLength(1);
    expect(result.items[0]?.files[0]).toMatchObject({
      contentType: "image/jpeg",
      byteSize: 1,
    });
  });
});
