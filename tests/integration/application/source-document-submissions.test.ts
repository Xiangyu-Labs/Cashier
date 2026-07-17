import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { StoredFileAdapter } from "@/application/adapters/storage";
import {
  PostgresProcessingIntentAdapter,
  postgresLedgerProjectionAdapter,
  postgresRevisionAdapter,
  postgresSourceDocumentSubmissionAdapter,
  getTargetSourceDocument,
} from "@/application/adapters/postgres";
import {
  ledgerEntries,
  processingAttempts,
  processingOutbox,
  revisionEntries,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

class MemoryFileStore {
  readonly files = new Map<string, Buffer>();

  async upload(key: string, data: Buffer): Promise<string> {
    this.files.set(key, Buffer.from(data));
    return `/private/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    return Buffer.from(this.files.get(key) ?? []);
  }

  async delete(key: string): Promise<{ success: boolean }> {
    return { success: this.files.delete(key) };
  }
}

async function finalizedFile(adapter: StoredFileAdapter, ledgerId: string, body: Buffer) {
  const plan = await adapter.createUploadPlan(ledgerId, [
    { contentType: "image/jpeg", byteSize: body.length, originalFilename: "receipt.jpg" },
  ]);
  await adapter.uploadTarget({
    ledgerId,
    uploadSessionId: plan.id,
    targetId: plan.targets[0]!.id,
    contentType: "image/jpeg",
    body,
  });
  const [file] = await adapter.finalizeUpload({
    ownerLedgerId: ledgerId,
    uploadSessionId: plan.id,
    finalizationToken: plan.finalizationToken,
    targetIds: [plan.targets[0]!.id],
  });
  return file!;
}

const entry = {
  categoryId: null,
  amount: "12.50",
  currency: "CNY",
  itemName: "Lunch",
  description: null,
  convertedAmount: "12.50",
  exchangeRate: "1.000000",
} as const;

describe("target source-document submissions", () => {
  it("atomically creates text, image, and mixed pending revisions with durable intents", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const storage = new StoredFileAdapter(new MemoryFileStore());
    const image = await finalizedFile(storage, ledgerId, Buffer.from("image"));

    const text = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "Lunch 12.50",
    });
    const imageOnly = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      storedFileIds: [image.id],
    });
    const mixed = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "Mixed",
      storedFileIds: [image.id],
    });

    expect(new Set([text.document.id, imageOnly.document.id, mixed.document.id]).size).toBe(3);
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(3);
    expect(await db.select().from(processingOutbox)).toHaveLength(3);
    expect(await db.select().from(processingAttempts)).toHaveLength(3);
    expect(await db.select().from(revisionFiles)).toHaveLength(2);
    expect(mixed.intent).toMatchObject({
      sourceDocumentId: mixed.document.id,
      revisionId: mixed.revision.id,
    });
  });

  it("rolls back the document, revision, and intent when evidence is not finalized", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [unfinalized] = await db
      .insert(storedFiles)
      .values({
        ledgerId,
        storageProvider: "local",
        storageKey: `${ledgerId}/unfinalized`,
        contentType: "image/jpeg",
        byteSize: 1,
      })
      .returning();

    await expect(
      postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
        ledgerId,
        storedFileIds: [unfinalized!.id],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(sourceDocuments)).toHaveLength(0);
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(0);
    expect(await db.select().from(processingOutbox)).toHaveLength(0);
  });

  it.each([
    ["failed", "PROCESSING_UNAVAILABLE"],
    ["anomaly", null],
  ] as const)(
    "keeps a first %s outcome without an active revision or ledger projection",
    async (outcome, failureCode) => {
      const db = getTestDb();
      const { ledgerId } = await createTestUserWithLedger(db);
      const pending = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
        ledgerId,
        submittedText: "first parse evidence",
      });

      await expect(
        postgresRevisionAdapter.preserveTerminalOutcome({
          ledgerId,
          sourceDocumentId: pending.document.id,
          revisionId: pending.revision.id,
          outcome,
          ...(failureCode == null ? { anomalyReason: "unreadable" } : { failureCode }),
        })
      ).resolves.toBe(true);

      const document = await postgresRevisionAdapter.get(ledgerId, pending.document.id);
      expect(document).toMatchObject({
        activeRevisionId: null,
        pendingRevisionId: pending.revision.id,
        supportedActions: ["retry", "edit_retry", "manual_correction", "delete"],
      });
      expect(await db.select().from(revisionEntries)).toHaveLength(0);
      expect(await db.select().from(ledgerEntries)).toHaveLength(0);
    }
  );

  it("preserves active results across failed/anomalous retries and rejects stale activation", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await postgresLedgerProjectionAdapter.createManual({ ledgerId, entries: [entry] });
    const activeEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, active.revisionId),
    });

    const failed = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      submittedText: "failed retry",
      inheritEvidence: true,
    });
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      revisionId: failed.revision.id,
      outcome: "failed",
    });
    const anomalous = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      submittedText: "anomalous edit retry",
      inheritEvidence: true,
    });
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      revisionId: anomalous.revision.id,
      outcome: "anomaly",
      anomalyReason: "unreadable",
    });

    expect(
      await postgresLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: failed.revision.id,
        entries: [{ ...entry, amount: "99.00" }],
      })
    ).toBe(false);
    expect(
      await postgresRevisionAdapter.preserveTerminalOutcome({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: failed.revision.id,
        outcome: "failed",
      })
    ).toBe(false);
    const document = await postgresRevisionAdapter.get(ledgerId, active.sourceDocumentId);
    expect(document).toMatchObject({
      activeRevisionId: active.revisionId,
      pendingRevisionId: anomalous.revision.id,
    });
    expect(
      await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, activeEntry!.id) })
    ).toMatchObject({ amount: "12.50", deletedAt: null });
  });

  it("inherits immutable evidence on retry and deduplicates post-commit dispatch", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const storage = new StoredFileAdapter(new MemoryFileStore());
    const image = await finalizedFile(storage, ledgerId, Buffer.from("image"));
    const initial = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      submittedText: "original",
      storedFileIds: [image.id],
    });
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: initial.document.id,
      revisionId: initial.revision.id,
      outcome: "failed",
    });
    const retry = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      sourceDocumentId: initial.document.id,
      inheritEvidence: true,
    });

    await Promise.all([
      new PostgresProcessingIntentAdapter().dispatch(retry.intent),
      new PostgresProcessingIntentAdapter().dispatch(retry.intent),
    ]);
    const retryRevision = await db.query.sourceDocumentRevisions.findFirst({
      where: eq(sourceDocumentRevisions.id, retry.revision.id),
    });
    const retryFiles = await db.query.revisionFiles.findMany({
      where: eq(revisionFiles.revisionId, retry.revision.id),
    });
    expect(retry.document.id).toBe(initial.document.id);
    expect(retryRevision?.submittedText).toBe("original");
    expect(retryFiles.map((file) => file.storedFileId)).toEqual([image.id]);
    expect(await db.select().from(processingOutbox)).toHaveLength(2);
    expect(await db.select().from(processingAttempts)).toHaveLength(2);
  });

  it("returns ordered stored-file identities and rejects cross-workspace retry evidence", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    const storage = new StoredFileAdapter(new MemoryFileStore());
    const first = await finalizedFile(storage, ledgerId, Buffer.from("first"));
    const second = await finalizedFile(storage, ledgerId, Buffer.from("second"));
    const other = await finalizedFile(storage, otherLedgerId, Buffer.from("other"));
    const submitted = await postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
      ledgerId,
      storedFileIds: [second.id, first.id],
    });

    const detail = await getTargetSourceDocument(ledgerId, submitted.document.id);
    expect(detail?.files.map((file) => file.id)).toEqual([second.id, first.id]);
    expect(detail).not.toHaveProperty("imageUrls");
    expect(JSON.stringify(detail)).not.toContain("/api/uploads/");
    expect(JSON.stringify(detail)).not.toContain("storageKey");
    await postgresRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: submitted.document.id,
      revisionId: submitted.revision.id,
      outcome: "failed",
    });
    await expect(
      postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
        ledgerId,
        sourceDocumentId: submitted.document.id,
        storedFileIds: [other.id],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      postgresSourceDocumentSubmissionAdapter.createPendingWithIntent({
        ledgerId: otherLedgerId,
        sourceDocumentId: submitted.document.id,
        inheritEvidence: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
