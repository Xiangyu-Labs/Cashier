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
import { StaleSourceDocumentVersionError } from "@/lib/errors";
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

async function currentVersion(sourceDocumentId: string): Promise<number> {
  const db = getTestDb();
  const row = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, sourceDocumentId),
    columns: { stateVersion: true },
  });
  if (row == null) throw new Error("Source document not found");
  return row.stateVersion;
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
      cancelPendingRevision(ledgerId, pending.document.id, pending.document.version)
    ).resolves.toMatchObject({ status: "cancelled", version: pending.document.version + 1 });

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

  it("rejects a stale replay and requires a fresh version, which then reports no pending revision", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const pending = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "Lunch 12 CNY",
    });
    const staleVersion = pending.document.version;

    // A: advance the document N -> N+1 by cancelling.
    await expect(
      cancelPendingRevision(ledgerId, pending.document.id, staleVersion)
    ).resolves.toMatchObject({ status: "cancelled" });
    const afterCancel = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    expect(afterCancel?.stateVersion).toBe(staleVersion + 1);

    // B: a stale replay at the pre-commit version N is rejected with zero writes.
    await expect(
      cancelPendingRevision(ledgerId, pending.document.id, staleVersion)
    ).rejects.toThrow(StaleSourceDocumentVersionError);
    const afterStaleReplay = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.document.id),
    });
    expect(afterStaleReplay?.stateVersion).toBe(afterCancel?.stateVersion);

    // B refreshes to the current version N+1 and retries: there is no longer a
    // pending revision to cancel, so this reports a conflict rather than a
    // silent no-op — the document is already terminal.
    await expect(
      cancelPendingRevision(ledgerId, pending.document.id, staleVersion + 1)
    ).rejects.toThrow("Source document has no pending revision");
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

    const result = await cancelPendingRevision(
      ledgerId,
      active.document.id,
      retry.document.version
    );
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    // The document's own status reverts to the restored active result — the
    // *revision* being cancelled is "cancelled", but the document status here
    // is a distinct field that reports what the document now shows the user.
    expect(result).toMatchObject({ status: "completed", version: retry.document.version + 1 });
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
    const versionAfterCandidateStored = await currentVersion(active.document.id);

    // The candidate *revision* is abandoned, but the document's own status
    // reverts to the still-active original result — the document status here
    // is a distinct field, not an echo of the revision outcome.
    await expect(
      cancelPendingRevision(ledgerId, active.document.id, versionAfterCandidateStored)
    ).resolves.toMatchObject({ status: "completed" });
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    const revision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, retry.revision.id),
    });
    expect(revision?.outcome).toBe("abandoned");
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
    const raceStartVersion = retry.document.version;

    // Both writers start from the same observed version. Whichever transaction
    // locks the document row first commits and advances the version; the other
    // either observes the new pointer state (storeCandidateRevision has no CAS
    // of its own) or is rejected as stale (cancelPendingRevision's version no
    // longer matches once the other writer has already committed).
    const [stored, cancelled] = await Promise.allSettled([
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
      cancelPendingRevision(ledgerId, active.document.id, raceStartVersion),
    ]);
    const [document, revision] = await Promise.all([
      db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, active.document.id) }),
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, retry.revision.id),
      }),
    ]);

    if (cancelled.status === "fulfilled") {
      // Cancel won the lock race: the candidate store observed the cleared
      // pending pointer and became a no-op.
      expect(stored).toMatchObject({ status: "fulfilled", value: false });
      expect(document?.activeRevisionId).toBe(active.revision.id);
      expect(document?.pendingRevisionId).toBeNull();
      expect(revision?.outcome).toBe("cancelled");
    } else {
      // The candidate store committed first and advanced the version: cancel's
      // now-stale version is rejected with zero writes from cancel's side.
      expect(cancelled.reason).toBeInstanceOf(StaleSourceDocumentVersionError);
      expect(stored).toMatchObject({ status: "fulfilled", value: true });
      expect(document?.pendingRevisionId).toBe(retry.revision.id);
      expect(revision?.outcome).toBe("completed");
    }
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
      abandonCandidateRevision(ledgerId, active.document.id, retry.document.version)
    ).resolves.toMatchObject({ version: retry.document.version + 1, status: "completed" });
    const document = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.document.id),
    });
    expect(document?.pendingRevisionId).toBeNull();
  });
});
