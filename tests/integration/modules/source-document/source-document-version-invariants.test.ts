/**
 * Canonical version-invariant suite for every existing-document command on
 * `SourceDocumentAggregateWritePort`. Each command must, against the real
 * database: (a) advance `stateVersion` by exactly +1 when it produces a
 * user-observable change, (b) where the command supports replay at the
 * *current* version, either return success with the version unchanged (a
 * true no-op) or fail in a well-defined non-stale way — never silently
 * double-increment — and (c) reject a *stale* (already-superseded) version
 * with zero writes.
 *
 * The `Record<ExistingDocumentCommand, ...>` registry below is typed from
 * `keyof SourceDocumentAggregateWritePort`: adding a new port method changes
 * `ExistingDocumentCommand` and this file fails to compile until a scenario
 * is added for it. That is the enforcement mechanism, not a comment.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { serverComposition } from "@/application/server-composition-root";
import type { SourceDocumentAggregateWritePort } from "@/modules/source-document/application/ports";
import { storeDuplicatePendingRevision } from "@/application/adapters/postgres";
import { createPendingRevisionInTransaction } from "@/application/adapters/postgres/revisions";
import { ConflictError, NotFoundError, StaleSourceDocumentVersionError } from "@/lib/errors";
import { sourceDocuments } from "@/persistence";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

/**
 * Every command on the port that mutates an *existing* document under a
 * caller-supplied `expectedVersion` CAS. Excluded, and why:
 * - `createProcessingDocument` / `createManualDocument`: create a *new*
 *   document; there is no prior version to be a CAS against.
 * - `completeProcessing` / `applyMainCurrencyChange` / `recalculateConversions`:
 *   provider- and ledger-settings-driven internal writes keyed by revision
 *   ids or FX recalculation batches, not a browser-facing versioned command.
 * - `resolveDuplicate`: one port method with two distinct terminal outcomes
 *   ("keep" vs "discard"), split here into two scenario keys so each is
 *   independently exercised.
 */
type ExistingDocumentCommand =
  | Exclude<
      keyof SourceDocumentAggregateWritePort,
      | "createProcessingDocument"
      | "createManualDocument"
      | "completeProcessing"
      | "applyMainCurrencyChange"
      | "recalculateConversions"
      | "resolveDuplicate"
    >
  | "resolveDuplicateKeep"
  | "resolveDuplicateDiscard";

const port: SourceDocumentAggregateWritePort = serverComposition.sourceDocumentAggregate;

const entry = {
  categoryId: null,
  amount: "12.00",
  currency: "CNY",
  itemName: "Item",
  description: null,
  convertedAmount: "12.00",
  exchangeRate: "1.000000",
} as const;

async function newLedger() {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(
    db,
    `version-invariants-${crypto.randomUUID()}`
  );
  return ledgerId;
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

async function currentTitle(sourceDocumentId: string): Promise<string | null> {
  const db = getTestDb();
  const row = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, sourceDocumentId),
    columns: { title: true },
  });
  if (row == null) throw new Error("Source document not found");
  return row.title;
}

/** An active, completed document with `count` entries — version 1. */
async function createActiveDocument(ledgerId: string, count = 1) {
  const created = await port.createManualDocument({
    expectedMainCurrency: "CNY",
    ledgerId,
    title: "Original",
    entryDate: "2026-08-01",
    entries: Array.from({ length: count }, (_, index) => ({
      ...entry,
      itemName: `Item ${index + 1}`,
    })),
  });
  const db = getTestDb();
  const entries = await db.query.ledgerEntries.findMany({
    where: (row, { eq: eqOp, and, isNull }) =>
      and(eqOp(row.sourceDocumentRevisionId, created.revisionId), isNull(row.deletedAt)),
    orderBy: (row, { asc }) => [asc(row.position)],
  });
  return { sourceDocumentId: created.sourceDocumentId, entryIds: entries.map((row) => row.id) };
}

/** A document with a fresh, still-processing pending revision — version 1. */
async function createProcessingDocument(ledgerId: string) {
  const pending = await port.createProcessingDocument({
    ledgerId,
    submittedText: "Processing fixture",
  });
  return { sourceDocumentId: pending.document.id, version: pending.document.version };
}

/** An active document plus its active revision id, for duplicate-review fixtures. */
async function createActiveDocumentWithRevision(ledgerId: string) {
  const document = await createActiveDocument(ledgerId);
  const row = await getTestDb().query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, document.sourceDocumentId),
    columns: { activeRevisionId: true },
  });
  if (row?.activeRevisionId == null) throw new Error("Expected an active revision");
  return { ...document, revisionId: row.activeRevisionId };
}

/**
 * A `candidate_pending` document: an active result plus a completed,
 * undecided candidate revision on top of it — returns the version after the
 * candidate is stored.
 */
async function createCandidatePendingDocument(ledgerId: string) {
  const active = await createActiveDocument(ledgerId);
  const db = getTestDb();
  const pending = await db.transaction((tx) =>
    createPendingRevisionInTransaction(tx, {
      ledgerId,
      sourceDocumentId: active.sourceDocumentId,
      submittedText: "Retry",
    })
  );
  const { storeCandidateRevision } = await import("@/application/adapters/postgres");
  const stored = await storeCandidateRevision(
    ledgerId,
    active.sourceDocumentId,
    pending.revision.id,
    "Candidate",
    [{ ...entry, itemName: "Candidate item" }]
  );
  if (!stored) throw new Error("Expected candidate revision to be stored");
  return {
    sourceDocumentId: active.sourceDocumentId,
    version: await currentVersion(active.sourceDocumentId),
  };
}

/** A `duplicate_pending` document — a completed, active revision flagged as a duplicate. */
async function createDuplicatePendingDocument(ledgerId: string) {
  const pending = await createProcessingDocument(ledgerId);
  const matched = await createActiveDocumentWithRevision(ledgerId);
  const stored = await storeDuplicatePendingRevision(
    ledgerId,
    pending.sourceDocumentId,
    (await getTestDb().query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, pending.sourceDocumentId),
      columns: { pendingRevisionId: true },
    }))!.pendingRevisionId!,
    "Duplicate candidate",
    [entry],
    {
      matchedSourceDocumentId: matched.sourceDocumentId,
      matchedRevisionId: matched.revisionId,
      matchedTitle: "Original",
      matchedEntryDate: "2026-08-01",
      matchedCreatedAt: new Date().toISOString(),
      reason: "Same bill",
      confidence: 0.9,
    }
  );
  if (!stored) throw new Error("Expected duplicate-pending revision to be stored");
  return {
    sourceDocumentId: pending.sourceDocumentId,
    version: await currentVersion(pending.sourceDocumentId),
  };
}

const registry: Record<ExistingDocumentCommand, () => Promise<void>> = {
  async saveChanges() {
    const ledgerId = await newLedger();
    const { sourceDocumentId } = await createActiveDocument(ledgerId);

    const changed = await port.saveChanges({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 1,
      sourceDocument: { title: "Updated" },
      entries: [],
    });
    expect(changed).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No-op: replaying the same (already-applied) title at the current
    // version is a true no-op — success, version unchanged.
    const noop = await port.saveChanges({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 2,
      sourceDocument: { title: "Updated" },
      entries: [],
    });
    expect(noop).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    const stale = await port.saveChanges({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 1,
      sourceDocument: { title: "Stale write" },
      entries: [],
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
    expect(await currentTitle(sourceDocumentId)).toBe("Updated");
  },

  async updateDocuments() {
    const ledgerId = await newLedger();
    const { sourceDocumentId } = await createActiveDocument(ledgerId);
    const target = (expectedVersion: number) => [{ sourceDocumentId, expectedVersion }];

    const changed = await port.updateDocuments({
      ledgerId,
      targets: target(1),
      data: { title: "Batch title" },
    });
    expect(changed).toMatchObject({
      ok: true,
      versions: [{ sourceDocumentId, version: 2 }],
      data: { updatedCount: 1 },
    });

    // No-op: the title already matches — zero writes, version unchanged.
    const noop = await port.updateDocuments({
      ledgerId,
      targets: target(2),
      data: { title: "Batch title" },
    });
    expect(noop).toMatchObject({
      ok: true,
      versions: [{ sourceDocumentId, version: 2 }],
      data: { updatedCount: 0 },
    });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    const stale = await port.updateDocuments({
      ledgerId,
      targets: target(1),
      data: { title: "Stale batch title" },
    });
    expect(stale).toMatchObject({
      ok: false,
      reason: "stale",
      staleTargets: [{ sourceDocumentId, expectedVersion: 1, currentVersion: 2 }],
    });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
    expect(await currentTitle(sourceDocumentId)).toBe("Batch title");
  },

  async addEntry() {
    const ledgerId = await newLedger();
    const { sourceDocumentId } = await createActiveDocument(ledgerId);

    const changed = await port.addEntry({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      amount: "5.00",
      itemName: "New item",
    });
    expect(changed).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No no-op case: every successful call adds a distinct new entry, so
    // there is no "replay is a no-op" scenario to exercise here.

    const stale = await port.addEntry({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      amount: "9.00",
      itemName: "Stale item",
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async updateEntries() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, entryIds } = await createActiveDocument(ledgerId);
    const ledgerEntryId = entryIds[0]!;

    const changed = await port.updateEntries({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      ledgerEntryId,
      itemName: "Renamed",
    });
    expect(changed).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No-op: the patch already matches the entry's current value.
    const noop = await port.updateEntries({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 2 },
      ledgerEntryId,
      itemName: "Renamed",
    });
    expect(noop).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    const stale = await port.updateEntries({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      ledgerEntryId,
      itemName: "Stale rename",
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async deleteEntries() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, entryIds } = await createActiveDocument(ledgerId, 2);

    const changed = await port.deleteEntries({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      ledgerEntryId: entryIds[0]!,
    });
    expect(changed).toMatchObject({ ok: true, version: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No no-op case: a deleted entry cannot be deleted again — a replay of
    // the exact same call is necessarily at a stale version (covered below)
    // since the first delete already advanced stateVersion.

    const stale = await port.deleteEntries({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
      ledgerEntryId: entryIds[1]!,
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async batchUpdateEntries() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, entryIds } = await createActiveDocument(ledgerId);
    const targets = (expectedVersion: number) => [{ sourceDocumentId, expectedVersion }];

    const changed = await port.batchUpdateEntries({
      ledgerId,
      targets: targets(1),
      ledgerEntryIds: entryIds,
      itemName: "Batch renamed",
    });
    expect(changed).toMatchObject({
      ok: true,
      versions: [{ sourceDocumentId, version: 2 }],
      data: { affectedCount: 1 },
    });

    // No-op: the patch already matches every selected entry's current value.
    const noop = await port.batchUpdateEntries({
      ledgerId,
      targets: targets(2),
      ledgerEntryIds: entryIds,
      itemName: "Batch renamed",
    });
    expect(noop).toMatchObject({
      ok: true,
      versions: [{ sourceDocumentId, version: 2 }],
      data: { affectedCount: 0 },
    });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    const stale = await port.batchUpdateEntries({
      ledgerId,
      targets: targets(1),
      ledgerEntryIds: entryIds,
      itemName: "Stale batch rename",
    });
    expect(stale).toMatchObject({
      ok: false,
      reason: "stale",
      staleTargets: [{ sourceDocumentId, expectedVersion: 1, currentVersion: 2 }],
    });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async batchDeleteEntries() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, entryIds } = await createActiveDocument(ledgerId, 2);
    const targets = (expectedVersion: number) => [{ sourceDocumentId, expectedVersion }];

    const changed = await port.batchDeleteEntries({
      ledgerId,
      targets: targets(1),
      ledgerEntryIds: [entryIds[0]!],
    });
    expect(changed.succeeded).toEqual([{ id: entryIds[0], sourceDocumentId, version: 2 }]);
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No no-op case: deleting the same entry twice is not idempotent — a
    // replay is necessarily at a stale version once the first delete commits.

    const stale = await port.batchDeleteEntries({
      ledgerId,
      targets: targets(1),
      ledgerEntryIds: [entryIds[1]!],
    });
    expect(stale.stale).toEqual([
      { id: entryIds[1], sourceDocumentId, expectedVersion: 1, currentVersion: 2 },
    ]);
    expect(stale.succeeded).toEqual([]);
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async splitEntries() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, entryIds } = await createActiveDocument(ledgerId, 3);

    const changed = await port.splitEntries({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 1,
      ledgerEntryIds: [entryIds[0]!],
      entryDate: "2026-08-05",
    });
    expect(changed).toMatchObject({ ok: true, version: 2, data: { movedEntryCount: 1 } });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No no-op case: a split always mints a brand-new document and moves
    // entries; replaying the exact call is necessarily against a stale
    // version once the first split commits.

    const stale = await port.splitEntries({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 1,
      ledgerEntryIds: [entryIds[1]!],
      entryDate: "2026-08-05",
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    expect(await currentVersion(sourceDocumentId)).toBe(2);
  },

  async installRetry() {
    const ledgerId = await newLedger();
    const { sourceDocumentId } = await createActiveDocument(ledgerId);

    const changed = await port.installRetry({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 1,
      inheritEvidence: true,
      supersedeProcessing: true,
    });
    expect(changed.document.version).toBe(2);
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    // No no-op case: `supersedeProcessing: true` (what every real retry
    // sends) deliberately allows a second retry to lay a fresh pending
    // revision on top of one still processing — so a call at the new
    // current version is not a no-op and not rejected, it advances again.
    const superseded = await port.installRetry({
      ledgerId,
      sourceDocumentId,
      expectedVersion: 2,
      inheritEvidence: true,
      supersedeProcessing: true,
    });
    expect(superseded.document.version).toBe(3);
    expect(await currentVersion(sourceDocumentId)).toBe(3);

    await expect(
      port.installRetry({
        ledgerId,
        sourceDocumentId,
        expectedVersion: 1,
        inheritEvidence: true,
        supersedeProcessing: true,
      })
    ).rejects.toThrow(StaleSourceDocumentVersionError);
    expect(await currentVersion(sourceDocumentId)).toBe(3);
  },

  async acceptCandidate() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, version } = await createCandidatePendingDocument(ledgerId);
    const staleVersion = version - 1;

    const changed = await port.acceptCandidate(ledgerId, sourceDocumentId, version);
    expect(changed).toMatchObject({ version: version + 1, status: "completed" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    // No no-op case: accepting clears `pendingRevisionId`, so a replay at
    // the new current version has no candidate left to accept — it is
    // rejected as a `ConflictError`, not silently re-accepted or mistaken
    // for a stale-version problem (the version itself matches).
    await expect(port.acceptCandidate(ledgerId, sourceDocumentId, version + 1)).rejects.toThrow(
      ConflictError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    await expect(port.acceptCandidate(ledgerId, sourceDocumentId, staleVersion)).rejects.toThrow(
      StaleSourceDocumentVersionError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);
  },

  async abandonCandidate() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, version } = await createCandidatePendingDocument(ledgerId);
    const staleVersion = version - 1;

    const changed = await port.abandonCandidate(ledgerId, sourceDocumentId, version);
    expect(changed).toMatchObject({ version: version + 1, status: "completed" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    // No no-op case: abandoning clears `pendingRevisionId` the same way
    // accepting does — a replay at the current version has nothing left to
    // abandon and is rejected as a `ConflictError`.
    await expect(port.abandonCandidate(ledgerId, sourceDocumentId, version + 1)).rejects.toThrow(
      ConflictError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    await expect(port.abandonCandidate(ledgerId, sourceDocumentId, staleVersion)).rejects.toThrow(
      StaleSourceDocumentVersionError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);
  },

  async cancelProcessing() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, version } = await createProcessingDocument(ledgerId);

    const changed = await port.cancelProcessing(ledgerId, sourceDocumentId, version);
    expect(changed).toMatchObject({ version: version + 1, status: "cancelled" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    // No no-op case: cancelling clears `pendingRevisionId` — a replay at the
    // current version has no pending revision left and is rejected as a
    // `ConflictError` ("Source document has no pending revision").
    await expect(port.cancelProcessing(ledgerId, sourceDocumentId, version + 1)).rejects.toThrow(
      ConflictError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    await expect(port.cancelProcessing(ledgerId, sourceDocumentId, version)).rejects.toThrow(
      StaleSourceDocumentVersionError
    );
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);
  },

  async resolveDuplicateKeep() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, version } = await createDuplicatePendingDocument(ledgerId);
    const staleVersion = version - 1;

    const changed = await port.resolveDuplicate({
      ledgerId,
      sourceDocumentId,
      expectedVersion: version,
      decision: "keep",
    });
    expect(changed).toMatchObject({ version: version + 1, status: "completed" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    // No-op: replaying "keep" at the current (already-kept) version reports
    // the same success without a further write.
    const noop = await port.resolveDuplicate({
      ledgerId,
      sourceDocumentId,
      expectedVersion: version + 1,
      decision: "keep",
    });
    expect(noop).toMatchObject({ version: version + 1, status: "completed" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    await expect(
      port.resolveDuplicate({
        ledgerId,
        sourceDocumentId,
        expectedVersion: staleVersion,
        decision: "keep",
      })
    ).rejects.toThrow(StaleSourceDocumentVersionError);
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);
  },

  async resolveDuplicateDiscard() {
    const ledgerId = await newLedger();
    const { sourceDocumentId, version } = await createDuplicatePendingDocument(ledgerId);
    const staleVersion = version - 1;

    const changed = await port.resolveDuplicate({
      ledgerId,
      sourceDocumentId,
      expectedVersion: version,
      decision: "discard",
    });
    expect(changed).toMatchObject({ version: version + 1, status: "deleted" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    // No-op: replaying "discard" at the current (already-discarded) version
    // still reads the now-tombstoned row and reports the same success.
    const noop = await port.resolveDuplicate({
      ledgerId,
      sourceDocumentId,
      expectedVersion: version + 1,
      decision: "discard",
    });
    expect(noop).toMatchObject({ version: version + 1, status: "deleted" });
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);

    await expect(
      port.resolveDuplicate({
        ledgerId,
        sourceDocumentId,
        expectedVersion: staleVersion,
        decision: "discard",
      })
    ).rejects.toThrow(StaleSourceDocumentVersionError);
    expect(await currentVersion(sourceDocumentId)).toBe(version + 1);
  },

  async deleteDocuments() {
    const ledgerId = await newLedger();
    const { sourceDocumentId } = await createActiveDocument(ledgerId);

    // Advance the version once via an unrelated command first, so the stale
    // sub-check below can target a genuinely superseded (but still-present)
    // document, distinct from the "already deleted" case.
    await port.updateDocuments({
      ledgerId,
      targets: [{ sourceDocumentId, expectedVersion: 1 }],
      data: { title: "Before delete" },
    });
    expect(await currentVersion(sourceDocumentId)).toBe(2);

    const stale = await port.deleteDocuments({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 1 },
    });
    expect(stale).toMatchObject({ ok: false, reason: "stale", currentVersion: 2 });
    const db = getTestDb();
    const beforeDelete = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(beforeDelete?.deletedAt).toBeNull();
    expect(beforeDelete?.stateVersion).toBe(2);

    const changed = await port.deleteDocuments({
      ledgerId,
      target: { sourceDocumentId, expectedVersion: 2 },
    });
    expect(changed).toMatchObject({ ok: true, version: 3 });
    const afterDelete = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDocumentId),
    });
    expect(afterDelete?.deletedAt).not.toBeNull();
    expect(afterDelete?.stateVersion).toBe(3);

    // No no-op case: once deleted, the document is invisible to the locked
    // read every write path uses — a replay is rejected as `NotFoundError`,
    // not a silent no-op and not a stale-version result.
    await expect(
      port.deleteDocuments({ ledgerId, target: { sourceDocumentId, expectedVersion: 3 } })
    ).rejects.toThrow(NotFoundError);
  },

  async deleteDocumentsBatch() {
    // Not implemented in the production composition root: `deleteDocuments`
    // is called once per target instead (see
    // `batchDeleteSourceDocumentsAction` in
    // `src/modules/source-document/server-actions/batch.ts`), which is
    // already covered above by the `deleteDocuments` scenario. This optional
    // port slot is reserved for a future true multi-document batch adapter.
    expect(port.deleteDocumentsBatch).toBeUndefined();
  },
};

describe("source document aggregate — version invariants", () => {
  for (const [name, run] of Object.entries(registry) as Array<
    [ExistingDocumentCommand, () => Promise<void>]
  >) {
    it(`${name}: +1 on change, no-op or well-defined replay, stale rejected with zero writes`, run);
  }
});
