import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  abandonCandidateRevision,
  cancelPendingRevision,
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  storeCandidateRevision,
} from "@/application/adapters/postgres";
import {
  processingAttempts,
  processingOutbox,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";

async function createActiveDocument(ledgerId: string) {
  const pending = await postgresRevisionAdapter.createPending({
    ledgerId,
    submittedText: "Original 12 CNY",
  });
  await postgresLedgerProjectionAdapter.activateRevision({
    ledgerId,
    sourceDocumentId: pending.document.id,
    revisionId: pending.revision.id,
    title: "Original",
    entries: [
      {
        amount: "12.00",
        currency: "CNY",
        itemName: "Original",
        categoryId: null,
        description: null,
        convertedAmount: "12.00",
        exchangeRate: "1",
      },
    ],
  });
  return pending;
}

describe("cancel source-document processing", () => {
  it("retains a cancelled first parse and terminates its task records", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const pending = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "Lunch 12 CNY",
    });

    await expect(
      cancelPendingRevision(ledgerId, pending.document.id, pending.revision.id)
    ).resolves.toMatchObject({ status: "cancelled", restoredActiveResult: false });
    await expect(
      cancelPendingRevision(ledgerId, pending.document.id, pending.revision.id)
    ).resolves.toMatchObject({ status: "cancelled", restoredActiveResult: false });

    const [document, revision, outbox, attempt, view] = await Promise.all([
      db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, pending.document.id) }),
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, pending.revision.id),
      }),
      db.query.processingOutbox.findFirst({
        where: eq(processingOutbox.revisionId, pending.revision.id),
      }),
      db.query.processingAttempts.findFirst({
        where: eq(processingAttempts.revisionId, pending.revision.id),
      }),
      postgresRevisionAdapter.get(ledgerId, pending.document.id),
    ]);
    expect(document?.pendingRevisionId).toBeNull();
    expect(revision?.outcome).toBe("cancelled");
    expect(outbox?.status).toBe("cancelled");
    expect(attempt?.status).toBe("cancelled");
    expect(view?.supportedActions).toEqual(["retry", "edit_retry", "delete"]);
  });

  it("cancels a retry and immediately restores the active result", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await createActiveDocument(ledgerId);
    const retry = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.document.id,
      inheritEvidence: true,
    });

    await db
      .update(sourceDocuments)
      .set({ title: "Edited during retry" })
      .where(eq(sourceDocuments.id, active.document.id));

    const result = await cancelPendingRevision(ledgerId, active.document.id, retry.revision.id);
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    expect(result).toMatchObject({ status: "cancelled", restoredActiveResult: true });
    expect(document?.activeRevisionId).toBe(active.revision.id);
    expect(document?.pendingRevisionId).toBeNull();
    expect(document?.title).toBe("Edited during retry");
  });

  it("abandons a candidate when completion wins the cancellation race", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await createActiveDocument(ledgerId);
    const retry = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.document.id,
      inheritEvidence: true,
    });
    await storeCandidateRevision(ledgerId, active.document.id, retry.revision.id, "Candidate", [
      {
        amount: "20.00",
        currency: "CNY",
        itemName: "Candidate",
        categoryId: null,
        description: null,
        convertedAmount: "20.00",
        exchangeRate: "1",
      },
    ]);

    await expect(
      cancelPendingRevision(ledgerId, active.document.id, retry.revision.id)
    ).resolves.toMatchObject({ status: "abandoned", restoredActiveResult: true });
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    expect(document?.title).toBe("Original");
  });

  it("keeps pointers consistent when cancellation races candidate storage", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await createActiveDocument(ledgerId);
    const retry = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.document.id,
      inheritEvidence: true,
    });

    const [stored, cancelled] = await Promise.all([
      storeCandidateRevision(ledgerId, active.document.id, retry.revision.id, "Candidate", [
        {
          amount: "20.00",
          currency: "CNY",
          itemName: "Candidate",
          categoryId: null,
          description: null,
          convertedAmount: "20.00",
          exchangeRate: "1",
        },
      ]),
      cancelPendingRevision(ledgerId, active.document.id, retry.revision.id),
    ]);
    const [document, revision] = await Promise.all([
      db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, active.document.id) }),
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, retry.revision.id),
      }),
    ]);

    expect(document?.activeRevisionId).toBe(active.revision.id);
    expect(document?.pendingRevisionId).toBeNull();
    expect(["cancelled", "abandoned"]).toContain(revision?.outcome);
    expect(stored).toBe(revision?.outcome === "abandoned");
    expect(cancelled.restoredActiveResult).toBe(true);
  });

  it.each(["failed", "anomaly"] as const)("abandons a %s retry candidate", async (outcome) => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await createActiveDocument(ledgerId);
    const retry = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.document.id,
      inheritEvidence: true,
    });
    await db
      .update(sourceDocumentRevisions)
      .set({ outcome, finalizedAt: new Date() })
      .where(
        and(
          eq(sourceDocumentRevisions.id, retry.revision.id),
          eq(sourceDocumentRevisions.outcome, "processing")
        )
      );

    await expect(
      abandonCandidateRevision(ledgerId, active.document.id, retry.revision.id)
    ).resolves.toBe(true);
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    expect(document?.pendingRevisionId).toBeNull();
  });
});
