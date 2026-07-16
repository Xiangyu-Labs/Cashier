import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  createSqliteAuthenticationAdapter,
  sqliteCategoryAdapter,
  sqliteCurrencyAdapter,
  sqliteIdempotencyAdapter,
  sqliteLedgerAdapter,
  sqliteLedgerProjectionAdapter,
  sqliteRevisionAdapter,
  sqliteServiceCredentialAdapter,
  sqliteSettingsAdapter,
} from "@/application/adapters/sqlite";
import {
  createLocalUploadPlanForSubmission,
  LocalStoredFileAdapter,
  LOCAL_UPLOAD_LIMITS,
} from "@/application/adapters/local";
import {
  currencyRates,
  entryCategories,
  ledgers,
  ledgerEntries,
  revisionEntries,
  revisionFiles,
  serviceCredentials,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
  uploadSessions,
} from "@/persistence";
import { deleteSourceDocument } from "@/modules/source-document/application/use-cases/delete-source-document";

class MemoryLocalFileStore {
  readonly files = new Map<string, Buffer>();

  async upload(key: string, data: Buffer): Promise<string> {
    this.files.set(key, Buffer.from(data));
    return `/private/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const data = this.files.get(key);
    if (data == null) throw new Error("missing file");
    return Buffer.from(data);
  }

  async delete(key: string): Promise<{ success: boolean }> {
    this.files.delete(key);
    return { success: true };
  }
}

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

    const first = await sqliteRevisionAdapter.createPending({
      ledgerId,
      submittedText: "first",
    });
    await expect(sqliteRevisionAdapter.get(otherLedgerId, first.document.id)).resolves.toBeNull();
    await expect(
      sqliteRevisionAdapter.createPending({ ledgerId, sourceDocumentId: first.document.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      sqliteRevisionAdapter.markProcessing({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: first.revision.id,
      })
    ).resolves.toBe(true);
    await expect(
      sqliteRevisionAdapter.preserveTerminalOutcome({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: first.revision.id,
        outcome: "failed",
        failureCode: "PROCESSING_UNAVAILABLE",
      })
    ).resolves.toBe(true);

    const retry = await sqliteRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: first.document.id,
      submittedText: "retry",
    });
    await sqliteRevisionAdapter.markProcessing({
      ledgerId,
      sourceDocumentId: first.document.id,
      revisionId: retry.revision.id,
    });
    await expect(
      sqliteLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: first.document.id,
        revisionId: retry.revision.id,
        entries: [projectionEntry],
      })
    ).resolves.toBe(true);

    const failedRetry = await sqliteRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: first.document.id,
      submittedText: "bad retry",
    });
    await sqliteRevisionAdapter.preserveTerminalOutcome({
      ledgerId,
      sourceDocumentId: first.document.id,
      revisionId: failedRetry.revision.id,
      outcome: "anomaly",
      anomalyReason: "unreadable",
    });
    const preserved = await sqliteRevisionAdapter.get(ledgerId, first.document.id);
    expect(preserved).toMatchObject({
      activeRevisionId: retry.revision.id,
      pendingRevisionId: failedRetry.revision.id,
    });

    const second = await sqliteRevisionAdapter.createPending({ ledgerId, submittedText: "second" });
    const page1 = await sqliteRevisionAdapter.list({ ledgerId, limit: 1 });
    const page2 = await sqliteRevisionAdapter.list({
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
    const pending = await sqliteRevisionAdapter.createPending({ ledgerId });

    await expect(
      sqliteLedgerProjectionAdapter.activateRevision({
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
    expect(revision?.outcome).toBe("queued");
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
    expect(await db.select().from(revisionEntries)).toHaveLength(0);
  });

  it("never creates target projections for an already-deleted legacy bill", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const [legacy] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        status: "deleted",
        deletedAt: new Date(),
        imageUrls: [`/api/uploads/${ledgerId}/legacy/receipt.jpg`],
      })
      .returning();

    await expect(
      sqliteRevisionAdapter.createPending({ ledgerId, sourceDocumentId: legacy!.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(sourceDocumentRevisions)).toHaveLength(0);
    expect(await db.select().from(revisionEntries)).toHaveLength(0);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it("soft deletes active and pending documents without removing evidence or accepting late completion", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const active = await sqliteLedgerProjectionAdapter.createManual({
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
    const pending = await sqliteRevisionAdapter.createPending({
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      storedFileIds: [file!.id],
    });
    expect(pending.document.supportedActions).toEqual(["delete"]);
    const revisionCount = (await db.select().from(sourceDocumentRevisions)).length;
    const fileLinkCount = (await db.select().from(revisionFiles)).length;

    await expect(
      deleteSourceDocument({ ledgerId, sourceDocumentId: active.sourceDocumentId })
    ).resolves.toEqual({ sourceDocumentId: active.sourceDocumentId, deleted: true });
    await expect(
      deleteSourceDocument({ ledgerId, sourceDocumentId: active.sourceDocumentId })
    ).resolves.toEqual({ sourceDocumentId: active.sourceDocumentId, deleted: false });
    await expect(
      sqliteLedgerProjectionAdapter.activateRevision({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: pending.revision.id,
        entries: [{ ...projectionEntry, amount: "99.00" }],
      })
    ).resolves.toBe(false);
    await expect(
      sqliteRevisionAdapter.markProcessing({
        ledgerId,
        sourceDocumentId: active.sourceDocumentId,
        revisionId: pending.revision.id,
      })
    ).resolves.toBe(false);

    const deleted = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, active.sourceDocumentId),
    });
    expect(deleted).toMatchObject({
      status: "deleted",
      activeRevisionId: active.revisionId,
      pendingRevisionId: pending.revision.id,
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

  it("creates and edits manual projections, recalculates atomically, and soft deletes", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const created = await sqliteLedgerProjectionAdapter.createManual({
      ledgerId,
      title: "Manual",
      entryDate: "2026-07-15",
      entries: [projectionEntry],
    });
    const originalEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, created.revisionId),
    });
    expect(originalEntry).toBeDefined();

    const replacementRevisionId = await sqliteLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId: created.sourceDocumentId,
      title: "Edited",
      entries: [{ ...projectionEntry, amount: "18.00" }],
    });
    const replacementEntry = await db.query.ledgerEntries.findFirst({
      where: eq(ledgerEntries.sourceDocumentRevisionId, replacementRevisionId),
    });
    expect(replacementEntry?.amount).toBe("18.00");
    expect(
      (await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, originalEntry!.id) }))
        ?.deletedAt
    ).not.toBeNull();

    await expect(
      sqliteLedgerProjectionAdapter.recalculate({
        ledgerId,
        updates: [
          {
            ledgerEntryId: replacementEntry!.id,
            convertedAmount: "2.50",
            exchangeRate: "0.138889",
          },
        ],
      })
    ).resolves.toBe(1);
    await expect(
      sqliteLedgerProjectionAdapter.softDelete(ledgerId, created.sourceDocumentId)
    ).resolves.toBe(true);
    const deleted = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(deleted?.status).toBe("deleted");
    expect(
      (
        await db.query.ledgerEntries.findFirst({
          where: eq(ledgerEntries.id, replacementEntry!.id),
        })
      )?.deletedAt
    ).not.toBeNull();
  });

  it("implements ledger, category, currency, settings, auth, credential, and idempotency ports", async () => {
    const db = getTestDb();
    const { userId, ledgerId } = await createTestUserWithLedger(db);
    await db
      .update(ledgers)
      .set({ metadata: { settings: { mainCurrency: "CNY" } } })
      .where(eq(ledgers.id, ledgerId));
    await db.insert(entryCategories).values({ ledgerId, name: "Food" });
    await db.insert(currencyRates).values({
      date: "2026-07-15",
      base: "EUR",
      rates: { CNY: 8, USD: 2 },
    });
    await db.insert(serviceCredentials).values({
      id: "credential-1",
      ledgerId,
      key: "secret-key",
      name: "API",
    });

    await expect(sqliteLedgerAdapter.isOwnedByUser(ledgerId, userId)).resolves.toBe(true);
    await expect(sqliteLedgerAdapter.getLedgerIdForCredential("credential-1")).resolves.toBe(
      ledgerId
    );
    await expect(sqliteCategoryAdapter.list(ledgerId)).resolves.toHaveLength(1);
    await expect(sqliteSettingsAdapter.get(ledgerId)).resolves.toMatchObject({
      mainCurrency: "CNY",
    });
    await expect(sqliteCurrencyAdapter.convert("16", "CNY", "USD")).resolves.toBe("4.000000");
    await expect(
      createSqliteAuthenticationAdapter(async () => userId).requireUser()
    ).resolves.toEqual({
      id: userId,
    });
    await expect(sqliteServiceCredentialAdapter.authenticate("secret-key")).resolves.toEqual({
      id: "credential-1",
      ledgerId,
    });

    let calls = 0;
    const operation = vi.fn(async () => {
      calls += 1;
      await Promise.resolve();
      return { id: calls };
    });
    const results = await Promise.all([
      sqliteIdempotencyAdapter.execute("same-key", operation),
      sqliteIdempotencyAdapter.execute("same-key", operation),
    ]);
    expect(results).toEqual([{ id: 1 }, { id: 1 }]);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("plans, validates, finalizes, expires, and authorizes local stored files", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const { ledgerId: otherLedgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      crypto.randomUUID()
    );
    const storage = new MemoryLocalFileStore();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const adapter = new LocalStoredFileAdapter(storage, () => now);
    const bytes = Buffer.from("image-bytes");
    const plan = await adapter.createUploadPlan(ledgerId, [
      {
        contentType: "image/jpeg",
        byteSize: bytes.length,
        originalFilename: "receipt.jpg",
      },
    ]);
    expect(plan.targets[0]?.url).not.toContain(ledgerId);
    const uploaded = await adapter.uploadTarget({
      ledgerId,
      uploadSessionId: plan.id,
      targetId: plan.targets[0]!.id,
      contentType: "image/jpeg",
      body: bytes,
    });
    const [finalized] = await adapter.finalizeUpload({
      ownerLedgerId: ledgerId,
      uploadSessionId: plan.id,
      finalizationToken: plan.finalizationToken,
      targetIds: [plan.targets[0]!.id],
    });
    expect(finalized).toMatchObject({ id: uploaded.id, ownerLedgerId: ledgerId });
    await expect(
      adapter.finalizeUpload({
        ownerLedgerId: ledgerId,
        uploadSessionId: plan.id,
        finalizationToken: plan.finalizationToken,
        targetIds: [plan.targets[0]!.id],
      })
    ).resolves.toMatchObject([{ id: uploaded.id }]);
    await expect(
      adapter.finalizeUpload({
        ownerLedgerId: otherLedgerId,
        uploadSessionId: plan.id,
        finalizationToken: plan.finalizationToken,
        targetIds: [plan.targets[0]!.id],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const pending = await sqliteRevisionAdapter.createPending({
      ledgerId,
      storedFileIds: [uploaded.id],
    });
    expect(
      await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, pending.document.id),
      })
    ).toMatchObject({ imageUrls: [`/api/uploads/${ledgerId}/stored/${uploaded.id}`] });
    await expect(adapter.readAuthorized(ledgerId, uploaded.id)).resolves.toMatchObject({
      file: { id: uploaded.id },
    });
    await expect(adapter.readAuthorized(otherLedgerId, uploaded.id)).resolves.toBeNull();
    expect(pending.document.pendingRevisionId).toBe(pending.revision.id);

    await expect(createLocalUploadPlanForSubmission(ledgerId, [])).resolves.toBeNull();
    await expect(
      adapter.createUploadPlan(
        ledgerId,
        Array.from({ length: LOCAL_UPLOAD_LIMITS.maxFiles + 1 }, () => ({
          contentType: "image/jpeg",
          byteSize: 1,
          originalFilename: null,
        }))
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      adapter.createUploadPlan(ledgerId, [
        { contentType: "text/plain", byteSize: 1, originalFilename: null },
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      adapter.createUploadPlan(ledgerId, [
        {
          contentType: "image/jpeg",
          byteSize: LOCAL_UPLOAD_LIMITS.maxBytesPerFile + 1,
          originalFilename: null,
        },
      ])
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const expiring = await adapter.createUploadPlan(ledgerId, [
      { contentType: "image/png", byteSize: 1, originalFilename: null },
    ]);
    now = new Date(Date.parse(expiring.expiresAt) + 1);
    await expect(
      adapter.uploadTarget({
        ledgerId,
        uploadSessionId: expiring.id,
        targetId: expiring.targets[0]!.id,
        contentType: "image/png",
        body: new Uint8Array([1]),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await db.query.uploadSessions.findFirst({ where: eq(uploadSessions.id, expiring.id) })
    ).toMatchObject({ status: "expired" });
  });
});
