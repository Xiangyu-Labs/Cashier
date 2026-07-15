import { and, eq, inArray, isNull, max, ne } from "drizzle-orm";
import type { LedgerProjectionEntryContract, LedgerProjectionPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  entryCategories,
  ledgerEntries,
  ledgers,
  revisionEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

type SqliteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function activeDocumentWhere(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    eq(sourceDocuments.id, sourceDocumentId),
    ne(sourceDocuments.status, "deleted"),
    isNull(sourceDocuments.deletedAt)
  )!;
}

function assertEntryValues(entries: readonly LedgerProjectionEntryContract[]): void {
  for (const entry of entries) {
    if (entry.itemName.trim() === "" || !Number.isFinite(Number(entry.amount))) {
      throw new ValidationError(
        "Ledger projection entries require an item name and numeric amount"
      );
    }
  }
}

function assertCategoryOwnership(
  tx: SqliteTransaction,
  ledgerId: string,
  entries: readonly LedgerProjectionEntryContract[]
): void {
  const categoryIds = [
    ...new Set(entries.flatMap((entry) => (entry.categoryId == null ? [] : [entry.categoryId]))),
  ];
  if (categoryIds.length === 0) return;
  const owned = tx
    .select({ id: entryCategories.id })
    .from(entryCategories)
    .where(
      and(
        eq(entryCategories.ledgerId, ledgerId),
        inArray(entryCategories.id, categoryIds),
        isNull(entryCategories.deletedAt)
      )
    )
    .all();
  if (owned.length !== categoryIds.length) {
    throw new NotFoundError("Entry category");
  }
}

function replaceProjection(
  tx: SqliteTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): void {
  assertEntryValues(input.entries);
  assertCategoryOwnership(tx, input.ledgerId, input.entries);
  const now = new Date();
  tx.update(ledgerEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .run();

  for (const [position, entry] of input.entries.entries()) {
    const ledgerEntryId = entry.id ?? crypto.randomUUID();
    tx.insert(ledgerEntries)
      .values({
        id: ledgerEntryId,
        ledgerId: input.ledgerId,
        sourceDocumentId: input.sourceDocumentId,
        sourceDocumentRevisionId: input.revisionId,
        categoryId: entry.categoryId,
        amount: entry.amount,
        currency: entry.currency,
        itemName: entry.itemName,
        description: entry.description,
        convertedAmount: entry.convertedAmount,
        exchangeRate: entry.exchangeRate,
        ...(entry.createdAt == null ? {} : { createdAt: new Date(entry.createdAt) }),
      })
      .run();
    tx.insert(revisionEntries)
      .values({
        ledgerId: input.ledgerId,
        revisionId: input.revisionId,
        ledgerEntryId,
        position,
      })
      .run();
  }
}

function replaceManualProjection(
  tx: SqliteTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    previousRevisionId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): void {
  assertEntryValues(input.entries);
  assertCategoryOwnership(tx, input.ledgerId, input.entries);
  const requestedIds = input.entries.flatMap((entry) => (entry.id == null ? [] : [entry.id]));
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new ValidationError("A ledger entry may only appear once per manual revision");
  }

  const previousEntries = tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.previousRevisionId),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .all();
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  if (requestedIds.some((id) => !previousById.has(id))) {
    throw new NotFoundError("Active manual ledger entry");
  }

  const now = new Date();
  for (const previous of previousEntries) {
    const link = tx
      .select({ id: revisionEntries.id })
      .from(revisionEntries)
      .where(
        and(
          eq(revisionEntries.ledgerId, input.ledgerId),
          eq(revisionEntries.revisionId, input.previousRevisionId),
          eq(revisionEntries.ledgerEntryId, previous.id)
        )
      )
      .get();
    if (link == null) throw new ConflictError("Manual revision projection is incomplete");

    const archivedId = crypto.randomUUID();
    tx.insert(ledgerEntries)
      .values({
        ...previous,
        id: archivedId,
        deletedAt: now,
        updatedAt: now,
      })
      .run();
    tx.update(revisionEntries)
      .set({ ledgerEntryId: archivedId })
      .where(eq(revisionEntries.id, link.id))
      .run();
  }

  const retainedIds = new Set(requestedIds);
  for (const previous of previousEntries) {
    if (!retainedIds.has(previous.id)) {
      tx.update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(ledgerEntries.ledgerId, input.ledgerId), eq(ledgerEntries.id, previous.id)))
        .run();
    }
  }

  for (const [position, entry] of input.entries.entries()) {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    const ledgerEntryId = existing?.id ?? entry.id ?? crypto.randomUUID();
    if (existing == null) {
      tx.insert(ledgerEntries)
        .values({
          id: ledgerEntryId,
          ledgerId: input.ledgerId,
          sourceDocumentId: input.sourceDocumentId,
          sourceDocumentRevisionId: input.revisionId,
          categoryId: entry.categoryId,
          amount: entry.amount,
          currency: entry.currency,
          itemName: entry.itemName,
          description: entry.description,
          convertedAmount: entry.convertedAmount,
          exchangeRate: entry.exchangeRate,
          ...(entry.createdAt == null ? {} : { createdAt: new Date(entry.createdAt) }),
        })
        .run();
    } else {
      tx.update(ledgerEntries)
        .set({
          sourceDocumentRevisionId: input.revisionId,
          categoryId: entry.categoryId,
          amount: entry.amount,
          currency: entry.currency,
          itemName: entry.itemName,
          description: entry.description,
          convertedAmount: entry.convertedAmount,
          exchangeRate: entry.exchangeRate,
          deletedAt: null,
          updatedAt: now,
        })
        .where(and(eq(ledgerEntries.ledgerId, input.ledgerId), eq(ledgerEntries.id, ledgerEntryId)))
        .run();
    }
    tx.insert(revisionEntries)
      .values({
        ledgerId: input.ledgerId,
        revisionId: input.revisionId,
        ledgerEntryId,
        position,
      })
      .run();
  }
}

function nextRevisionNumber(tx: SqliteTransaction, sourceDocumentId: string): number {
  const aggregate = tx
    .select({ value: max(sourceDocumentRevisions.revisionNumber) })
    .from(sourceDocumentRevisions)
    .where(eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId))
    .get();
  return (aggregate?.value ?? 0) + 1;
}

function createCompletedRevision(
  tx: SqliteTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    submittedText?: string | null;
  }
) {
  const now = new Date();
  return tx
    .insert(sourceDocumentRevisions)
    .values({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      revisionNumber: nextRevisionNumber(tx, input.sourceDocumentId),
      submittedText: input.submittedText ?? null,
      outcome: "completed",
      finalizedAt: now,
      submittedAt: now,
    })
    .returning()
    .get();
}

export const sqliteLedgerProjectionAdapter: LedgerProjectionPort = {
  async activateRevision(input) {
    return db.transaction((tx) => {
      const document = tx
        .select()
        .from(sourceDocuments)
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .get();
      if (document == null || document.pendingRevisionId !== input.revisionId) return false;
      const revision = tx
        .select()
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId)
          )
        )
        .get();
      if (
        revision == null ||
        (revision.outcome !== "queued" && revision.outcome !== "processing")
      ) {
        return false;
      }

      replaceProjection(tx, input);
      const now = new Date();
      tx.update(sourceDocumentRevisions)
        .set({ outcome: "completed", finalizedAt: now, anomalyReason: null, failureCode: null })
        .where(eq(sourceDocumentRevisions.id, input.revisionId))
        .run();
      tx.update(sourceDocuments)
        .set({
          activeRevisionId: input.revisionId,
          pendingRevisionId: null,
          status: "completed",
          anomalyReason: null,
          ...(input.title == null || input.title === "" ? {} : { title: input.title }),
          updatedAt: now,
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .run();
      return true;
    });
  },

  async createManual(input) {
    return db.transaction((tx) => {
      const ledger = tx
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(and(eq(ledgers.id, input.ledgerId), isNull(ledgers.deletedAt)))
        .get();
      if (ledger == null) throw new NotFoundError("Ledger");
      const sourceDocumentId = input.sourceDocumentId ?? crypto.randomUUID();
      const existing = tx
        .select({ id: sourceDocuments.id })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, sourceDocumentId))
        .get();
      if (existing != null) throw new ConflictError("Source document already exists");
      tx.insert(sourceDocuments)
        .values({
          id: sourceDocumentId,
          ledgerId: input.ledgerId,
          title: input.title ?? null,
          text: input.submittedText ?? null,
          imageUrls: [],
          status: "completed",
          type: "manual",
          entryDate: input.entryDate ?? null,
        })
        .run();
      const revision = createCompletedRevision(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
      });
      replaceProjection(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        revisionId: revision.id,
        entries: input.entries,
      });
      tx.update(sourceDocuments)
        .set({ activeRevisionId: revision.id, pendingRevisionId: null })
        .where(activeDocumentWhere(input.ledgerId, sourceDocumentId))
        .run();
      return { sourceDocumentId, revisionId: revision.id };
    });
  },

  async replaceManual(input) {
    return db.transaction((tx) => {
      const document = tx
        .select()
        .from(sourceDocuments)
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .get();
      if (document == null) throw new NotFoundError("Source document");
      if (document.type !== "manual" || document.activeRevisionId == null) {
        throw new ConflictError("Source document is not an active manual entry");
      }
      if (
        input.expectedActiveRevisionId !== undefined &&
        document.activeRevisionId !== input.expectedActiveRevisionId
      ) {
        throw new ConflictError("Manual entry changed before the edit was committed");
      }
      if (document.pendingRevisionId != null) {
        const pending = tx
          .select({ outcome: sourceDocumentRevisions.outcome })
          .from(sourceDocumentRevisions)
          .where(eq(sourceDocumentRevisions.id, document.pendingRevisionId))
          .get();
        if (pending?.outcome === "queued" || pending?.outcome === "processing") {
          throw new ConflictError("Source document has processing work");
        }
      }
      assertEntryValues(input.entries);
      assertCategoryOwnership(tx, input.ledgerId, input.entries);
      const revision = createCompletedRevision(tx, input);
      replaceManualProjection(tx, {
        ...input,
        previousRevisionId: document.activeRevisionId,
        revisionId: revision.id,
      });
      tx.update(sourceDocuments)
        .set({
          activeRevisionId: revision.id,
          pendingRevisionId: null,
          status: "completed",
          text: input.submittedText ?? document.text,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
          updatedAt: new Date(),
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .run();
      return revision.id;
    });
  },

  async recalculate(input) {
    if (input.updates.length === 0) return 0;
    return db.transaction((tx) => {
      const uniqueIds = new Set(input.updates.map((update) => update.ledgerEntryId));
      if (uniqueIds.size !== input.updates.length) {
        throw new ValidationError("A ledger entry may only be recalculated once per transaction");
      }
      for (const update of input.updates) {
        const active = tx
          .select({ id: ledgerEntries.id })
          .from(ledgerEntries)
          .innerJoin(
            sourceDocuments,
            and(
              eq(sourceDocuments.ledgerId, ledgerEntries.ledgerId),
              eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
              eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId)
            )
          )
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.id, update.ledgerEntryId),
              isNull(ledgerEntries.deletedAt),
              ne(sourceDocuments.status, "deleted"),
              isNull(sourceDocuments.deletedAt)
            )
          )
          .get();
        if (active == null) throw new NotFoundError("Active ledger entry projection");
        tx.update(ledgerEntries)
          .set({
            convertedAmount: update.convertedAmount,
            exchangeRate: update.exchangeRate,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.id, update.ledgerEntryId)
            )
          )
          .run();
      }
      return input.updates.length;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction((tx) => {
      const now = new Date();
      const deleted = tx
        .update(sourceDocuments)
        .set({ status: "deleted", deletedAt: now, updatedAt: now })
        .where(activeDocumentWhere(ledgerId, sourceDocumentId))
        .run();
      if (deleted.changes === 0) return false;
      tx.update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          )
        )
        .run();
      return true;
    });
  },
};
