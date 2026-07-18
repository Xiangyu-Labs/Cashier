import { and, desc, eq, isNotNull, isNull, lt, max, or } from "drizzle-orm";
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
  ledgerEntries,
  ledgers,
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
} from "@/persistence";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
export type PostgresTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
      deleted: row.status === "deleted" || row.deletedAt != null,
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
  let document = await tx
    .select()
    .from(sourceDocuments)
    .where(activeDocumentWhere(input.ledgerId, sourceDocumentId))
    .then((rows) => rows[0]);

  if (document == null && input.sourceDocumentId != null) {
    throw new NotFoundError("Source document");
  }
  if (document == null) {
    document = await tx
      .insert(sourceDocuments)
      .values({
        id: sourceDocumentId,
        ledgerId: input.ledgerId,
        type: "ai_parsed",
        ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
      })
      .returning()
      .then((rows) => rows[0]);
  } else if (document.pendingRevisionId != null) {
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
      currentPending?.outcome === "queued" ||
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
      outcome: "queued",
    })
    .returning()
    .then((rows) => rows[0]);
  if (revision == null) throw new ConflictError("Failed to create source document revision");

  const fileIds = [...new Set(input.storedFileIds ?? [])];
  if (fileIds.length !== (input.storedFileIds?.length ?? 0)) {
    throw new ValidationError("A stored file may only appear once in a revision");
  }
  for (const [position, storedFileId] of fileIds.entries()) {
    const file = await tx
      .select({ id: storedFiles.id })
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
    await tx.insert(revisionFiles)
      .values({
        ledgerId: input.ledgerId,
        revisionId: revision.id,
        storedFileId,
        position,
      })
      ;
  }

  document = await tx
    .update(sourceDocuments)
    .set({
      pendingRevisionId: revision.id,
      ...(input.entryDate === undefined ? {} : { entryDate: input.entryDate }),
      updatedAt: new Date(),
    })
    .where(activeDocumentWhere(input.ledgerId, sourceDocumentId))
    .returning()
    .then((rows) => rows[0]);
  if (document == null) throw new ConflictError("Failed to update source document revision pointer");
  return { document: mapDocument(document, "queued"), revision: mapRevision(revision) };
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
      const document = await tx
        .select({ pendingRevisionId: sourceDocuments.pendingRevisionId })
        .from(sourceDocuments)
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .then((rows) => rows[0]);
      if (document?.pendingRevisionId !== input.revisionId) return false;
      const updated = await tx
        .update(sourceDocumentRevisions)
        .set({ outcome: "processing" })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, input.ledgerId),
            eq(sourceDocumentRevisions.sourceDocumentId, input.sourceDocumentId),
            eq(sourceDocumentRevisions.id, input.revisionId),
            eq(sourceDocumentRevisions.outcome, "queued")
          )
        )
        .returning({ id: sourceDocumentRevisions.id });
      if (updated.length === 0) return false;
      return true;
    });
  },

  async preserveTerminalOutcome(input) {
    return db.transaction(async (tx) => {
      const document = await tx
        .select({ pendingRevisionId: sourceDocuments.pendingRevisionId })
        .from(sourceDocuments)
        .where(activeDocumentWhere(input.ledgerId, input.sourceDocumentId))
        .then((rows) => rows[0]);
      if (document?.pendingRevisionId !== input.revisionId) return false;
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
            or(
              eq(sourceDocumentRevisions.outcome, "queued"),
              eq(sourceDocumentRevisions.outcome, "processing")
            )
          )
        )
        .returning({ id: sourceDocumentRevisions.id });
      if (updated.length === 0) return false;
      return true;
    });
  },

  async softDelete(ledgerId, sourceDocumentId) {
    return db.transaction(async (tx) => {
      const deleted = await tx
        .update(sourceDocuments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(activeDocumentWhere(ledgerId, sourceDocumentId))
        .returning({ id: sourceDocuments.id });
      if (deleted.length === 0) return false;
      await tx.update(ledgerEntries)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            isNull(ledgerEntries.deletedAt)
          )
        )
        ;
      return true;
    });
  },
};
