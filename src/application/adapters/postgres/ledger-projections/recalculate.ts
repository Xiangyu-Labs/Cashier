import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { LedgerProjectionPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { compare as compareDecimal } from "@/lib/money/decimal";
import { transitionSourceDocument } from "@/modules/source-document/application/source-document-state";
import {
  duplicateReviews,
  ledgerEntries,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";
import {
  lockLedgerForUpdate,
  lockSourceDocumentForUpdate,
  lockSourceDocumentsForUpdate,
} from "../transaction-locks";
import { completeProcessingLeaseInTransaction } from "../processing-terminal";
import { softDeleteSourceDocumentInTransaction } from "../source-document-delete";

import {
  LedgerMainCurrencyChangedError,
  activeDocumentWhere,
  assertCategoryOwnership,
  assertEntryValues,
  replaceProjection,
  sameProjectionFingerprints,
} from "./shared";
import {
  copyRevisionFiles,
  createCompletedRevision,
  createCompletedProjectionInTransaction,
  replaceManualProjection,
} from "./manual-entries";

export const postgresLedgerProjectionAdapter: LedgerProjectionPort = {
  async activateRevision(input) {
    return db.transaction(async (tx) => {
      // Lock the ledger row to serialise with concurrent main-currency changes.
      // This is the first-active-projection path; the lock prevents a settings
      // main-currency change from interleaving with entry creation.
      await lockLedgerForUpdate(tx, input.ledgerId);

      // Also lock the source document row to serialise with concurrent soft-delete.
      // Lock order: ledger → source document (prevents deadlocks).
      let document: typeof sourceDocuments.$inferSelect;
      try {
        document = await lockSourceDocumentForUpdate(tx, input.ledgerId, input.sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }
      if (document.pendingRevisionId !== input.revisionId) return false;
      const revision = await tx
        .select()
        .from(sourceDocumentRevisions)
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId)
          )
        )
        .for("update")
        .then((rows) => rows[0]);
      if (revision == null || revision.outcome !== "processing") {
        return false;
      }
      if (!(await completeProcessingLeaseInTransaction(tx, input.lease, "completed"))) {
        return false;
      }

      await replaceProjection(tx, input);
      const now = new Date();
      const { state } = transitionSourceDocument(
        { status: "processing", hasActiveResult: false },
        { type: "processing_succeeded", duplicate: false }
      );
      await tx
        .update(sourceDocumentRevisions)
        .set({
          title: input.title ?? null,
          outcome: "completed",
          finalizedAt: now,
          anomalyReason: null,
          failureCode: null,
        })
        .where(eq(sourceDocumentRevisions.id, input.revisionId));
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: input.revisionId,
          pendingRevisionId: null,
          currentStatus: state.status,
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          ...(input.title == null || input.title === "" ? {} : { title: input.title }),
          updatedAt: now,
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return true;
    });
  },

  async createManual(input) {
    return db.transaction(async (tx) => {
      // Lock the ledger row to serialise with concurrent main-currency changes.
      // This is the first-active-projection path; the lock prevents a settings
      // main-currency change from interleaving with entry creation.
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (ledger.mainCurrency !== input.expectedMainCurrency) {
        throw new ConflictError("Ledger currency changed before quick entry commit");
      }

      const sourceDocumentId = input.sourceDocumentId ?? crypto.randomUUID();
      const revisionId = await createCompletedProjectionInTransaction(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId,
        type: "manual",
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.entryDate !== undefined ? { entryDate: input.entryDate } : {}),
        ...(input.submittedText !== undefined ? { submittedText: input.submittedText } : {}),
        entries: input.entries,
      });
      return { sourceDocumentId, revisionId };
    });
  },

  async replaceManual(input) {
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (
        input.expectedMainCurrency !== undefined &&
        ledger.mainCurrency !== input.expectedMainCurrency
      ) {
        throw new ConflictError("Ledger currency changed before the manual edit");
      }
      const document = await lockSourceDocumentForUpdate(
        tx,
        input.ledgerId,
        input.sourceDocumentId
      );
      if (document.type !== "manual" || document.activeRevisionId == null) {
        throw new ConflictError("Source document is not an active manual entry");
      }
      if (
        input.expectedActiveRevisionId !== undefined &&
        document.activeRevisionId !== input.expectedActiveRevisionId
      ) {
        throw new ConflictError("Manual entry changed before the edit was committed");
      }
      if (input.expectedProjection !== undefined) {
        const currentProjection = await tx
          .select({
            id: ledgerEntries.id,
            amount: ledgerEntries.amount,
            currency: ledgerEntries.currency,
            sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
          })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.ledgerId, input.ledgerId),
              eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
              isNull(ledgerEntries.deletedAt),
              or(
                eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
                ...(document.pendingRevisionId == null
                  ? []
                  : [eq(ledgerEntries.sourceDocumentRevisionId, document.pendingRevisionId)])
              )
            )
          );
        if (!sameProjectionFingerprints(input.expectedProjection, currentProjection)) {
          throw new ConflictError("Ledger entries changed before the manual edit");
        }
      }
      if (input.projectionConversions !== undefined && input.projectionConversions.length > 0) {
        const changesJson = JSON.stringify(
          input.projectionConversions.map((update) => ({
            id: update.ledgerEntryId,
            converted_amount: update.convertedAmount,
            exchange_rate: update.exchangeRate,
          }))
        );
        const updatedEntries = await tx.execute(sql`
          WITH changes AS (
            SELECT * FROM jsonb_to_recordset(${changesJson}::jsonb) AS value(
              id uuid,
              converted_amount numeric,
              exchange_rate numeric
            )
          )
          UPDATE ledger_entries AS entry
          SET converted_amount = changes.converted_amount,
              exchange_rate = changes.exchange_rate,
              updated_at = ${new Date()}
          FROM changes
          WHERE entry.id = changes.id
            AND entry.ledger_id = ${input.ledgerId}
            AND entry.source_document_id = ${input.sourceDocumentId}
            AND entry.deleted_at IS NULL
          RETURNING entry.id
        `);
        if (updatedEntries.rows.length !== input.projectionConversions.length) {
          throw new ConflictError("Ledger entries changed before the manual edit");
        }
      }
      if (document.pendingRevisionId != null) {
        const pending = await tx
          .select({ outcome: sourceDocumentRevisions.outcome })
          .from(sourceDocumentRevisions)
          .where(eq(sourceDocumentRevisions.id, document.pendingRevisionId))
          .then((rows) => rows[0]);
        if (pending?.outcome === "processing" || pending?.outcome === "completed") {
          throw new ConflictError("Source document has processing work");
        }
      }
      assertEntryValues(input.entries);
      await assertCategoryOwnership(tx, input.ledgerId, input.entries);
      const revision = await createCompletedRevision(tx, input);
      await replaceManualProjection(tx, {
        ...input,
        previousRevisionId: document.activeRevisionId,
        revisionId: revision.id,
      });
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: revision.id,
          pendingRevisionId: null,
          currentStatus: "completed",
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
          updatedAt: new Date(),
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return revision.id;
    });
  },

  async replaceActive(input) {
    return db.transaction(async (tx) => {
      const ledger = await lockLedgerForUpdate(tx, input.ledgerId);
      if (
        input.expectedMainCurrency !== undefined &&
        ledger.mainCurrency !== input.expectedMainCurrency
      ) {
        throw new LedgerMainCurrencyChangedError();
      }
      const document = await lockSourceDocumentForUpdate(
        tx,
        input.ledgerId,
        input.sourceDocumentId
      );
      if (
        document.activeRevisionId == null ||
        document.activeRevisionId !== input.expectedActiveRevisionId
      ) {
        throw new ConflictError("Source document active revision changed");
      }
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
            eq(sourceDocumentRevisions.id, document.activeRevisionId),
            eq(sourceDocumentRevisions.outcome, "completed")
          )
        )
        .then((rows) => rows[0]);
      if (activeRevision == null) throw new ConflictError("Active revision is not completed");

      const revision = await createCompletedRevision(tx, {
        ledgerId: input.ledgerId,
        sourceDocumentId: input.sourceDocumentId,
        submittedText: activeRevision.submittedText,
      });
      await copyRevisionFiles(tx, {
        ledgerId: input.ledgerId,
        fromRevisionId: document.activeRevisionId,
        toRevisionId: revision.id,
      });
      await replaceManualProjection(tx, {
        ...input,
        previousRevisionId: document.activeRevisionId,
        revisionId: revision.id,
      });
      await tx
        .update(sourceDocuments)
        .set({
          activeRevisionId: revision.id,
          pendingRevisionId: null,
          currentStatus: "completed",
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId));
      return revision.id;
    });
  },

  async recalculate(input) {
    if (input.updates.length === 0) return 0;
    return db.transaction(async (tx) => {
      await lockLedgerForUpdate(tx, input.ledgerId);
      const uniqueIds = new Set(input.updates.map((update) => update.ledgerEntryId));
      if (uniqueIds.size !== input.updates.length) {
        throw new ValidationError("A ledger entry may only be recalculated once per transaction");
      }
      const requestedIds = [...uniqueIds];
      const current = await tx
        .select({
          id: ledgerEntries.id,
          sourceDocumentId: ledgerEntries.sourceDocumentId,
          convertedAmount: ledgerEntries.convertedAmount,
          exchangeRate: ledgerEntries.exchangeRate,
        })
        .from(ledgerEntries)
        .innerJoin(
          sourceDocuments,
          and(
            eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
            eq(sourceDocuments.ledgerId, input.ledgerId),
            eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .where(
          and(
            eq(ledgerEntries.ledgerId, input.ledgerId),
            inArray(ledgerEntries.id, requestedIds),
            isNull(ledgerEntries.deletedAt)
          )
        );
      if (current.length !== input.updates.length) {
        throw new NotFoundError("Active ledger entry projection");
      }
      const currentById = new Map(current.map((entry) => [entry.id, entry] as const));
      const changedUpdates = input.updates.filter((update) => {
        const entry = currentById.get(update.ledgerEntryId)!;
        return (
          (entry.convertedAmount == null) !== (update.convertedAmount == null) ||
          (entry.convertedAmount != null &&
            update.convertedAmount != null &&
            compareDecimal(entry.convertedAmount, update.convertedAmount) !== 0) ||
          (entry.exchangeRate == null) !== (update.exchangeRate == null) ||
          (entry.exchangeRate != null &&
            update.exchangeRate != null &&
            compareDecimal(entry.exchangeRate, update.exchangeRate) !== 0)
        );
      });
      if (changedUpdates.length === 0) return 0;
      const documentIds = [
        ...new Set(
          changedUpdates.map((update) => currentById.get(update.ledgerEntryId)!.sourceDocumentId!)
        ),
      ].sort();
      await lockSourceDocumentsForUpdate(tx, input.ledgerId, documentIds);
      const changes = JSON.stringify(
        changedUpdates.map((update) => ({
          id: update.ledgerEntryId,
          converted_amount: update.convertedAmount,
          exchange_rate: update.exchangeRate,
        }))
      );
      const now = new Date();
      const updated = await tx.execute(sql`
        WITH changes AS (
          SELECT * FROM jsonb_to_recordset(${changes}::jsonb) AS value(
            id uuid,
            converted_amount numeric,
            exchange_rate numeric
          )
        )
        UPDATE ledger_entries AS entry
        SET converted_amount = changes.converted_amount,
            exchange_rate = changes.exchange_rate,
            updated_at = ${now}
        FROM changes, source_documents AS document
        WHERE entry.id = changes.id
          AND entry.ledger_id = ${input.ledgerId}
          AND entry.deleted_at IS NULL
          AND document.id = entry.source_document_id
          AND document.ledger_id = entry.ledger_id
          AND document.active_revision_id = entry.source_document_revision_id
          AND document.deleted_at IS NULL
        RETURNING entry.id
      `);
      if (updated.rows.length !== changedUpdates.length) {
        throw new NotFoundError("Active ledger entry projection");
      }
      await tx
        .update(sourceDocuments)
        .set({
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(sourceDocuments.ledgerId, input.ledgerId),
            inArray(sourceDocuments.id, documentIds),
            isNull(sourceDocuments.deletedAt)
          )
        );
      return changedUpdates.length;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction((tx) =>
      softDeleteSourceDocumentInTransaction(tx, ledgerId, sourceDocumentId)
    );
  },
};
