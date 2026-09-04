import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { LedgerProjectionEntryContract } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { SourceDocumentTypeValue } from "@/modules/source-document/types";
import {
  duplicateReviews,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "../transaction-locks";
import type { PostgresTransaction } from "../transaction-locks";

import {
  activeDocumentWhere,
  assertCategoryOwnership,
  assertEntryValues,
  replaceProjection,
  requireCurrency,
} from "./shared";

export async function replaceManualProjection(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    previousRevisionId: string;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<void> {
  assertEntryValues(input.entries);
  await assertCategoryOwnership(tx, input.ledgerId, input.entries);
  const requestedIds = input.entries.flatMap((entry) => (entry.id == null ? [] : [entry.id]));
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new ValidationError("A ledger entry may only appear once per manual revision");
  }

  const previousEntries = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.previousRevisionId),
        isNull(ledgerEntries.deletedAt)
      )
    );
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  const foreignRequestedIds = requestedIds.filter((id) => !previousById.has(id));
  if (foreignRequestedIds.length > 0) {
    const existing = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.id, foreignRequestedIds));
    if (existing.length > 0) throw new NotFoundError("Active ledger entry projection");
  }

  const now = new Date();
  const retainedIds = new Set(requestedIds);
  const retainedEntries = previousEntries.filter((previous) => retainedIds.has(previous.id));
  if (retainedEntries.length > 0) {
    // Retained rows move to the new revision in one statement; their positions
    // are appended after the new input entries.
    await tx.execute(sql`
      UPDATE ledger_entries entry
      SET source_document_revision_id = ${input.revisionId},
          position = positions.position + ${input.entries.length},
          updated_at = ${now}
      FROM (VALUES ${sql.join(
        retainedEntries.map((previous, index) => sql`(${previous.id}::uuid, ${index}::integer)`),
        sql`, `
      )}) AS positions(id, position)
      WHERE entry.id = positions.id
        AND entry.ledger_id = ${input.ledgerId}
    `);
  }

  if (retainedEntries.length > 0) {
    // Preserve the historical rows as soft-deleted archives in one insert.
    await tx.insert(ledgerEntries).values(
      retainedEntries.map((previous) => ({
        ...previous,
        id: crypto.randomUUID(),
        deletedAt: now,
        updatedAt: now,
      }))
    );
  }

  const removedIds = previousEntries
    .filter((previous) => !retainedIds.has(previous.id))
    .map((previous) => previous.id);
  if (removedIds.length > 0) {
    await tx
      .update(ledgerEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, removedIds),
          isNull(ledgerEntries.deletedAt)
        )
      );
  }

  const newEntries = input.entries.flatMap((entry, position) => {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    return existing == null
      ? [
          {
            id: entry.id ?? crypto.randomUUID(),
            ledgerId: input.ledgerId,
            sourceDocumentId: input.sourceDocumentId,
            sourceDocumentRevisionId: input.revisionId,
            position,
            categoryId: entry.categoryId,
            amount: entry.amount,
            currency: requireCurrency(entry.currency),
            itemName: entry.itemName,
            description: entry.description,
            convertedAmount: entry.convertedAmount,
            exchangeRate: entry.exchangeRate,
            ...(entry.createdAt == null ? {} : { createdAt: new Date(entry.createdAt) }),
          },
        ]
      : [];
  });
  if (newEntries.length > 0) {
    await tx.insert(ledgerEntries).values(newEntries);
  }

  const updatedEntries = input.entries.flatMap((entry, position) => {
    const existing = entry.id == null ? null : (previousById.get(entry.id) ?? null);
    return existing == null
      ? []
      : [
          {
            id: existing.id,
            position,
            categoryId: entry.categoryId,
            amount: entry.amount,
            currency: entry.currency,
            itemName: entry.itemName,
            description: entry.description,
            convertedAmount: entry.convertedAmount,
            exchangeRate: entry.exchangeRate,
          },
        ];
  });
  if (updatedEntries.length > 0) {
    await tx.execute(sql`
      UPDATE ledger_entries entry
      SET source_document_revision_id = ${input.revisionId},
          position = updates.position,
          category_id = updates.category_id,
          amount = updates.amount,
          currency = updates.currency,
          item_name = updates.item_name,
          description = updates.description,
          converted_amount = updates.converted_amount,
          exchange_rate = updates.exchange_rate,
          deleted_at = NULL,
          updated_at = ${now}
      FROM (VALUES ${sql.join(
        updatedEntries.map(
          (row) =>
            sql`(
              ${row.id}::uuid,
              ${row.position}::integer,
              ${row.categoryId}::uuid,
              ${row.amount}::numeric,
              ${row.currency}::varchar(3),
              ${row.itemName}::text,
              ${row.description}::text,
              ${row.convertedAmount}::numeric,
              ${row.exchangeRate}::numeric
            )`
        ),
        sql`, `
      )}) AS updates(id, position, category_id, amount, currency, item_name,
        description, converted_amount, exchange_rate)
      WHERE entry.id = updates.id
        AND entry.ledger_id = ${input.ledgerId}
    `);
  }
}

async function nextRevisionNumber(
  tx: PostgresTransaction,
  sourceDocumentId: string
): Promise<number> {
  const aggregate = await tx
    .select({ value: max(sourceDocumentRevisions.revisionNumber) })
    .from(sourceDocumentRevisions)
    .where(eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId))
    .then((rows) => rows[0]);
  return (aggregate?.value ?? 0) + 1;
}

export async function createCompletedRevision(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    submittedText?: string | null;
    revisionId?: string;
  }
) {
  const now = new Date();
  const revisionNumber = await nextRevisionNumber(tx, input.sourceDocumentId);
  const revision = await tx
    .insert(sourceDocumentRevisions)
    .values({
      ...(input.revisionId === undefined ? {} : { id: input.revisionId }),
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      revisionNumber,
      submittedText: input.submittedText ?? null,
      outcome: "completed",
      finalizedAt: now,
      submittedAt: now,
    })
    .returning()
    .then((rows) => rows[0]);
  if (revision == null) throw new ConflictError("Failed to create completed revision");
  return revision;
}

export async function replaceActiveProjectionInTransaction(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    expectedActiveRevisionId: string;
    expectedStateVersion?: number;
    incrementVersion?: boolean;
    revisionId: string;
    entries: readonly LedgerProjectionEntryContract[];
    title?: string;
    entryDate?: string;
  }
): Promise<string> {
  const pendingDuplicateReview = await tx
    .select({ id: duplicateReviews.id })
    .from(duplicateReviews)
    .where(
      and(
        eq(duplicateReviews.ledgerId, input.ledgerId),
        eq(duplicateReviews.sourceDocumentId, input.sourceDocumentId),
        eq(duplicateReviews.status, "pending")
      )
    )
    .then((rows) => rows[0]);
  if (pendingDuplicateReview != null) {
    throw new ConflictError("Source document has a pending duplicate review");
  }

  const document = await tx
    .select({
      activeRevisionId: sourceDocuments.activeRevisionId,
      pendingRevisionId: sourceDocuments.pendingRevisionId,
    })
    .from(sourceDocuments)
    .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
    .then((rows) => rows[0]);
  if (
    document?.activeRevisionId == null ||
    document.activeRevisionId !== input.expectedActiveRevisionId
  ) {
    throw new ConflictError("Source document active revision changed");
  }
  if (document.pendingRevisionId != null) {
    const pending = await tx
      .select({ outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
          eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
          eq(sourceDocumentRevisions.id, document.pendingRevisionId)
        )
      )
      .then((rows) => rows[0]);
    if (pending?.outcome === "processing" || pending?.outcome === "completed") {
      throw new ConflictError("Source document has processing work");
    }
  }

  const activeRevision = await tx
    .select({ submittedText: sourceDocumentRevisions.submittedText })
    .from(sourceDocumentRevisions)
    .where(
      and(
        eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
        eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
        eq(sourceDocumentRevisions.id, input.expectedActiveRevisionId),
        eq(sourceDocumentRevisions.outcome, "completed")
      )
    )
    .then((rows) => rows[0]);
  if (activeRevision == null) throw new ConflictError("Active revision is not completed");

  const revision = await createCompletedRevision(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    submittedText: activeRevision.submittedText,
    revisionId: input.revisionId,
  });
  await copyRevisionFiles(tx, {
    ledgerId: input.ledgerId,
    fromRevisionId: input.expectedActiveRevisionId,
    toRevisionId: revision.id,
  });
  await replaceManualProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    previousRevisionId: input.expectedActiveRevisionId,
    revisionId: revision.id,
    entries: input.entries,
  });
  const updated = await tx
    .update(sourceDocuments)
    .set({
      activeRevisionId: revision.id,
      pendingRevisionId: null,
      currentStatus: "completed",
      ...(input.incrementVersion === false
        ? {}
        : { stateVersion: sql`${sourceDocuments.stateVersion} + 1` }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
      updatedAt: new Date(),
    })
    .where(
      and(
        activeDocumentWhere(input.ledgerId, input.sourceDocumentId),
        eq(sourceDocuments.activeRevisionId, input.expectedActiveRevisionId),
        ...(input.expectedStateVersion === undefined
          ? []
          : [eq(sourceDocuments.stateVersion, input.expectedStateVersion)])
      )
    )
    .returning({ id: sourceDocuments.id })
    .then((rows) => rows[0]);
  if (updated == null) throw new ConflictError("Source document changed during the edit");
  return revision.id;
}

export async function ensureTargetLedgerProjection(
  ledgerId: string,
  sourceDocumentId: string
): Promise<string> {
  return db.transaction(async (tx) => {
    // Lock the ledger row to serialise with concurrent main-currency changes.
    await lockLedgerForUpdate(tx, ledgerId);

    // Also lock the source document row to serialise with concurrent soft-delete.
    // Lock order: ledger → source document (prevents deadlocks).
    const document = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    if (document.activeRevisionId != null) return document.activeRevisionId;
    if (document.currentStatus !== "completed") {
      throw new ConflictError("Source document has no completed active projection");
    }
    throw new ConflictError("Source document is missing its canonical active revision");
  });
}

export async function copyRevisionFiles(
  tx: PostgresTransaction,
  input: { ledgerId: string; fromRevisionId: string; toRevisionId: string }
): Promise<void> {
  // The source rows are already tenant-scoped by the WHERE clause, so the
  // copy inherits their ownership in a single INSERT ... SELECT.
  await tx.execute(sql`
    INSERT INTO revision_files (ledger_id, revision_id, stored_file_id, position, created_at)
    SELECT ledger_id, ${input.toRevisionId}, stored_file_id, position, now()
    FROM revision_files
    WHERE ledger_id = ${input.ledgerId}
      AND revision_id = ${input.fromRevisionId}
  `);
}

export async function createCompletedProjectionInTransaction(
  tx: PostgresTransaction,
  input: {
    ledgerId: string;
    sourceDocumentId: string;
    revisionId?: string;
    title?: string | null;
    entryDate?: string | null;
    submittedText?: string | null;
    copyFilesFromRevisionId?: string;
    type: SourceDocumentTypeValue;
    entries: readonly LedgerProjectionEntryContract[];
  }
): Promise<string> {
  const existing = await tx
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, input.sourceDocumentId))
    .then((rows) => rows[0]);
  if (existing != null) throw new ConflictError("Source document already exists");

  await tx.insert(sourceDocuments).values({
    id: input.sourceDocumentId,
    ledgerId: input.ledgerId,
    title: input.title ?? null,
    type: input.type,
    currentStatus: "completed",
    entryDate: input.entryDate ?? null,
  });
  const revision = await createCompletedRevision(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    ...(input.revisionId === undefined ? {} : { revisionId: input.revisionId }),
    ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
  });
  if (input.copyFilesFromRevisionId !== undefined) {
    await copyRevisionFiles(tx, {
      ledgerId: input.ledgerId,
      fromRevisionId: input.copyFilesFromRevisionId,
      toRevisionId: revision.id,
    });
  }
  await replaceProjection(tx, {
    ledgerId: input.ledgerId,
    sourceDocumentId: input.sourceDocumentId,
    revisionId: revision.id,
    entries: input.entries,
  });
  await tx
    .update(sourceDocuments)
    .set({ activeRevisionId: revision.id, pendingRevisionId: null })
    .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
  return revision.id;
}
