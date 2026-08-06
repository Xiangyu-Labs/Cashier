import { and, desc, eq, inArray, isNotNull, isNull, lt, max, or } from "drizzle-orm";
import type {
  RevisionOutcome,
  SourceDocumentContract,
  SourceDocumentPort,
  SourceDocumentRevisionContract,
} from "@/application/contracts";
import { supportedSourceDocumentActions } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  MAX_FILES,
  MAX_NORMALIZED_BYTES_PER_REVISION,
} from "@/modules/source-document/upload-policy";
import {
  duplicateReviews,
  ledgerEntries,
  ledgers,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";
import { assertProcessingLeaseHeld, lockSourceDocumentForUpdate } from "./transaction-locks";
import type { PostgresTransaction } from "./transaction-locks";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface CreatePendingRevisionInput {
  ledgerId: string;
  sourceDocumentId?: string;
  submittedText?: string | null;
  storedFileIds?: readonly string[];
  entryDate?: string | null;
}

function activeDocumentWhere(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    eq(sourceDocuments.id, sourceDocumentId),
    isNull(sourceDocuments.deletedAt)
  )!;
}

function mapRevision(
  row: typeof sourceDocumentRevisions.$inferSelect
): SourceDocumentRevisionContract {
  return {
    id: row.id,
    sourceDocumentId: row.sourceDocumentId,
    outcome: row.outcome as RevisionOutcome,
    submittedAt: row.submittedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  };
}

function mapDocument(
  row: typeof sourceDocuments.$inferSelect,
  pendingOutcome: RevisionOutcome | null
): SourceDocumentContract {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    activeRevisionId: row.activeRevisionId,
    pendingRevisionId: row.pendingRevisionId,
    supportedActions: supportedSourceDocumentActions({
      activeRevisionId: row.activeRevisionId,
      pendingOutcome,
      duplicateReviewPending: row.currentStatus === "duplicate_pending",
      deleted: row.deletedAt != null,
    }),
  };
}

function encodeCursor(row: typeof sourceDocuments.$inferSelect): string {
  return Buffer.from(JSON.stringify([row.createdAt.getTime(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "number" ||
      typeof parsed[1] !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return { createdAt: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new ValidationError("Invalid source document cursor");
  }
}

async function pendingOutcomes(rows: readonly (typeof sourceDocuments.$inferSelect)[]) {
  const result = new Map<string, RevisionOutcome>();
  await Promise.all(
    rows.map(async (row) => {
      if (row.pendingRevisionId == null) return;
      const revision = await db.query.sourceDocumentRevisions.findFirst({
        where: and(
          eq(sourceDocumentRevisions.ledgerId, row.ledgerId),
          eq(sourceDocumentRevisions.id, row.pendingRevisionId),
          eq(sourceDocumentRevisions.sourceDocumentId, row.id)
        ),
        columns: { outcome: true },
      });
      if (revision != null) result.set(row.id, revision.outcome as RevisionOutcome);
    })
  );
  return result;
}

export async function createPendingRevisionInTransaction(
  tx: PostgresTransaction,
  input: CreatePendingRevisionInput
): Promise<{ document: SourceDocumentContract; revision: SourceDocumentRevisionContract }> {
  const ledger = await tx
    .select({ id: ledgers.id })
    .from(ledgers)
    .where(and(eq(ledgers.id, input.ledgerId), isNull(ledgers.deletedAt)))
    .then((rows) => rows[0]);
  if (ledger == null) throw new NotFoundError("Ledger");

  const sourceDocumentId = input.sourceDocumentId ?? crypto.randomUUID();
  const existingDocument = await tx
    .select()
    .from(sourceDocuments)
    .where(activeDocumentWhere(input.ledgerId, sourceDocumentId))
    .then((rows) => rows[0]);

  if (existingDocument == null && input.sourceDocumentId != null) {
    throw new NotFoundError("Source document");
  }

  // Acquire a lock on existing documents or create a new one.
  const document =
    existingDocument == null
      ? await tx
          .insert(sourceDocuments)
          .values({
            id: sourceDocumentId,
            ledgerId: input.ledgerId,
            type: "ai_parsed",
            ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
          })
          .returning()
          .then((rows) => rows[0]!)
      : await lockSourceDocumentForUpdate(tx, input.ledgerId, sourceDocumentId);

  if (document.pendingRevisionId != null) {
    const currentPending = await tx
      .select({ outcome: sourceDocumentRevisions.outcome })
      .from(sourceDocumentRevisions)
      .where(
        and(
          eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
          eq(sourceDocumentRevisions.id, document.pendingRevisionId),
          eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId)
        )
      )
      .then((rows) => rows[0]);
    if (
      currentPending?.outcome === "processing" ||
      (currentPending?.outcome === "completed" && document.activeRevisionId != null)
    ) {
      throw new ConflictError("Source document already has a pending revision");
    }
  }

  const aggregate = await tx
    .select({ value: max(sourceDocumentRevisions.revisionNumber) })
    .from(sourceDocumentRevisions)
    .where(eq(sourceDocumentRevisions.sourceDocumentId, sourceDocumentId))
    .then((rows) => rows[0]);
  const revision = await tx
    .insert(sourceDocumentRevisions)
    .values({
      ledgerId: input.ledgerId,
      sourceDocumentId,
      revisionNumber: (aggregate?.value ?? 0) + 1,
      submittedText: input.submittedText ?? null,
      outcome: "processing",
    })
    .returning()
    .then((rows) => rows[0]);
  if (revision == null) throw new ConflictError("Failed to create source document revision");

  const fileIds = [...new Set(input.storedFileIds ?? [])];
  if (fileIds.length !== (input.storedFileIds?.length ?? 0)) {
    throw new ValidationError("A stored file may only appear once in a revision");
  }
  // Collect byte sizes for the per-revision aggregate check
  const storedFileRows: Array<{ id: string; byteSize: number }> = [];
  for (const storedFileId of fileIds) {
    const file = await tx
      .select({ id: storedFiles.id, byteSize: storedFiles.byteSize })
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.ledgerId, input.ledgerId),
          eq(storedFiles.id, storedFileId),
          isNull(storedFiles.deletedAt),
          isNotNull(storedFiles.finalizedAt)
        )
      )
      .then((rows) => rows[0]);
    if (file == null) throw new NotFoundError("Stored file");
    storedFileRows.push(file);
  }
  // Enforce per-revision byte aggregate limit
  const totalBytes = storedFileRows.reduce((sum, f) => sum + f.byteSize, 0);
  if (totalBytes > MAX_NORMALIZED_BYTES_PER_REVISION) {
    throw new ValidationError(
      `Total stored bytes ${totalBytes} exceeds revision limit of ${MAX_NORMALIZED_BYTES_PER_REVISION}`
    );
  }

  // Enforce per-revision file count limit (authoritative boundary).
  // fileIds is already deduplicated above, so this checks the final unique count.
  if (fileIds.length > MAX_FILES) {
    throw new ValidationError(
      `Total file count ${fileIds.length} exceeds revision limit of ${MAX_FILES}`
    );
  }

  // Ownership checks completed above; the file rows are inserted in one batch.
  if (storedFileRows.length > 0) {
    await tx.insert(revisionFiles).values(
      storedFileRows.map((file, position) => ({
        ledgerId: input.ledgerId,
        revisionId: revision.id,
        storedFileId: file.id,
        position,
      }))
    );
  }

  // A retry/supersede retires any *staged* duplicate review: the staged review
  // belongs to the candidate revision that this retry replaces and can never
  // be promoted. A pending duplicate review on the old active revision is
  // deliberately kept: the document is only `duplicate_pending` again after
  // the retry is rejected, so the original review must survive the retry.
  await tx
    .update(duplicateReviews)
    .set({
      status: "discarded",
      decision: "superseded",
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(duplicateReviews.ledgerId, input.ledgerId),
        eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
        eq(duplicateReviews.status, "staged")
      )
    );

  const updatedDocument = await tx
    .update(sourceDocuments)
    .set({
      pendingRevisionId: revision.id,
      ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
      updatedAt: new Date(),
    })
    .where(activeDocumentWhere(input.ledgerId, sourceDocumentId))
    .returning()
    .then((rows) => rows[0]);
  if (updatedDocument == null)
    throw new ConflictError("Failed to update source document revision pointer");
  return { document: mapDocument(updatedDocument, "processing"), revision: mapRevision(revision) };
}

export const postgresRevisionAdapter: SourceDocumentPort = {
  async get(ledgerId, id) {
    const document = await db.query.sourceDocuments.findFirst({
      where: activeDocumentWhere(ledgerId, id),
    });
    if (document == null) return null;
    const outcomes = await pendingOutcomes([document]);
    return mapDocument(document, outcomes.get(document.id) ?? null);
  },

  async list({ ledgerId, cursor, limit = DEFAULT_PAGE_SIZE }) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
    const decoded = cursor == null ? null : decodeCursor(cursor);
    const cursorCondition =
      decoded == null
        ? undefined
        : or(
            lt(sourceDocuments.createdAt, decoded.createdAt),
            and(
              eq(sourceDocuments.createdAt, decoded.createdAt),
              lt(sourceDocuments.id, decoded.id)
            )
          );
    const rows = await db
      .select()
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, ledgerId),
          isNull(sourceDocuments.deletedAt),
          cursorCondition
        )
      )
      .orderBy(desc(sourceDocuments.createdAt), desc(sourceDocuments.id))
      .limit(boundedLimit + 1);
    const hasNext = rows.length > boundedLimit;
    const pageRows = hasNext ? rows.slice(0, boundedLimit) : rows;
    const outcomes = await pendingOutcomes(pageRows);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => mapDocument(row, outcomes.get(row.id) ?? null)),
      nextCursor: hasNext && last != null ? encodeCursor(last) : null,
    };
  },

  async createPending(input) {
    return db.transaction(async (tx) => createPendingRevisionInTransaction(tx, input));
  },

  async markProcessing(input) {
    return db.transaction(async (tx) => {
      let document;
      try {
        document = await lockSourceDocumentForUpdate(tx, input.ledgerId, input.sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }
      if (document.pendingRevisionId !== input.revisionId) return false;
      const updated = await tx
        .update(sourceDocumentRevisions)
        .set({ outcome: "processing" })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId),
            eq(sourceDocumentRevisions.outcome, "processing")
          )
        )
        .returning({ id: sourceDocumentRevisions.id });
      if (updated.length === 0) return false;
      return true;
    });
  },

  async preserveTerminalOutcome(input) {
    return db.transaction(async (tx) => {
      let document;
      try {
        document = await lockSourceDocumentForUpdate(tx, input.ledgerId, input.sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }
      if (!(await assertProcessingLeaseHeld(tx, input.lease))) return false;
      if (document.pendingRevisionId !== input.revisionId) return false;
      const updated = await tx
        .update(sourceDocumentRevisions)
        .set({
          outcome: input.outcome,
          anomalyReason: input.anomalyReason ?? null,
          failureCode: input.failureCode ?? null,
          finalizedAt: new Date(),
        })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId),
            or(eq(sourceDocumentRevisions.outcome, "processing"))
          )
        )
        .returning({ id: sourceDocumentRevisions.id });
      if (updated.length === 0) return false;
      return true;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction(async (tx) => {
      // Lock the source document to serialise with concurrent operations.
      // Return false (not throw) when the document does not exist.
      try {
        await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
      } catch (error) {
        if (error instanceof NotFoundError) return false;
        throw error;
      }

      const now = new Date();
      // Supersede the document's own pending AND staged reviews. Reviews that
      // point at this document as the *matched* bill keep their snapshots.
      await tx
        .update(duplicateReviews)
        .set({
          status: "discarded",
          decision: "superseded",
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(duplicateReviews.ledgerId, ledgerId),
            eq(duplicateReviews.sourceDocumentId, sourceDocumentId),
            inArray(duplicateReviews.status, ["pending", "staged"])
          )
        );
      const deleted = await tx
        .update(sourceDocuments)
        .set({ deletedAt: now, updatedAt: now })
        .where(activeDocumentWhere(ledgerId, sourceDocumentId))
        .returning({ id: sourceDocuments.id });
      if (deleted.length === 0) return false;
      await tx
        .update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          )
        );
      return true;
    });
  },
};
