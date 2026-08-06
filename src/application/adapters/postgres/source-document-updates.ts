import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import type {
  LedgerProjectionEntryContract,
  LedgerProjectionEntryFingerprint,
} from "@/application/contracts";
import type {
  BatchUpdateSourceDocumentsResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "@/modules/source-document/contract-schemas";
import { postgresFxRateBook } from "./exchange-rate";
import { postgresLedgerProjectionAdapter } from "./ledger-projections";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";

function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt))!;
}

function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(whereSourceDocumentNotDeleted(ledgerId), eq(sourceDocuments.id, sourceDocumentId))!;
}

interface UpdateSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentPayload;
}

interface BatchUpdateSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
  data: BatchUpdateSourceDocumentsPayload;
}

type ProjectionEntrySnapshot = {
  id: string;
  sourceDocumentRevisionId: string | null;
  categoryId: string | null;
  amount: string;
  currency: string | null;
  itemName: string;
  description: string | null;
  convertedAmount: string | null;
  exchangeRate: string | null;
  createdAt: Date;
};

interface DateReestimatePlan {
  mainCurrency: string;
  initialEntries: ProjectionEntrySnapshot[];
  conversions: Array<{ convertedAmount: string; exchangeRate: string }>;
}

type QueryExecutor = Pick<typeof db, "select" | "execute">;

function normalizeCurrency(currency: string | null): string {
  return currency != null && currency !== "" ? currency : "CNY";
}

function toFingerprint(entry: {
  id: string;
  amount: string;
  currency: string | null;
  sourceDocumentRevisionId: string | null;
}): LedgerProjectionEntryFingerprint {
  return {
    id: entry.id,
    amount: entry.amount,
    currency: entry.currency,
    sourceDocumentRevisionId: entry.sourceDocumentRevisionId,
  };
}

function projectionEntriesChanged(
  initial: readonly ProjectionEntrySnapshot[],
  current: readonly ProjectionEntrySnapshot[]
): boolean {
  if (initial.length !== current.length) return true;
  return initial.some((entry, index) => {
    const actual = current[index];
    return (
      actual == null ||
      entry.id !== actual.id ||
      entry.amount !== actual.amount ||
      entry.currency !== actual.currency ||
      entry.sourceDocumentRevisionId !== actual.sourceDocumentRevisionId
    );
  });
}

async function prepareDateReestimate(
  ledgerId: string,
  sourceDocumentIds: readonly string[],
  entryDate: string
): Promise<DateReestimatePlan> {
  const [ledger, initialEntries] = await Promise.all([
    db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
      columns: { mainCurrency: true },
    }),
    loadProjectionEntriesForDocuments(db, ledgerId, sourceDocumentIds),
  ]);
  if (ledger == null) throw new ConflictError("Ledger changed before the date update");

  const conversions = await postgresFxRateBook.convertBatch(
    initialEntries.map((entry) => ({
      amount: entry.amount,
      from: normalizeCurrency(entry.currency),
      to: ledger.mainCurrency,
      date: entryDate,
    })),
    ledger.mainCurrency
  );

  return {
    mainCurrency: ledger.mainCurrency,
    initialEntries,
    conversions,
  };
}

async function updateProjectionConversions(
  tx: QueryExecutor,
  ledgerId: string,
  entries: readonly ProjectionEntrySnapshot[],
  conversions: readonly { convertedAmount: string; exchangeRate: string }[]
): Promise<void> {
  if (entries.length === 0) return;

  const changesJson = JSON.stringify(
    entries.map((entry, index) => ({
      id: entry.id,
      source_document_revision_id: entry.sourceDocumentRevisionId,
      amount: entry.amount,
      currency: entry.currency,
      converted_amount: round(conversions[index]!.convertedAmount, 2),
      exchange_rate: round(conversions[index]!.exchangeRate, 6),
    }))
  );
  const updatedEntries = await tx.execute(sql`
    WITH changes AS (
      SELECT * FROM jsonb_to_recordset(${changesJson}::jsonb) AS value(
        id uuid,
        source_document_revision_id uuid,
        amount numeric,
        currency text,
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
      AND entry.ledger_id = ${ledgerId}
      AND entry.source_document_revision_id = changes.source_document_revision_id
      AND entry.amount = changes.amount
      AND entry.currency IS NOT DISTINCT FROM changes.currency
      AND entry.deleted_at IS NULL
    RETURNING entry.id
  `);
  if (updatedEntries.rows.length !== entries.length) {
    throw new ConflictError("Ledger entries changed during the date update");
  }
}

function toManualProjectionEntry(
  entry: ProjectionEntrySnapshot,
  conversion: { convertedAmount: string; exchangeRate: string }
): LedgerProjectionEntryContract {
  return {
    id: entry.id,
    categoryId: entry.categoryId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: round(conversion.convertedAmount, 2),
    exchangeRate: round(conversion.exchangeRate, 6),
    createdAt: entry.createdAt.toISOString(),
  };
}

async function updateNonManualDocumentWithDate(input: {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentPayload;
  initialDocument: {
    type: "ai_parsed" | "manual";
    activeRevisionId: string | null;
    pendingRevisionId: string | null;
  };
  plan: DateReestimatePlan;
}): Promise<boolean> {
  const updatePatch = {
    updatedAt: new Date(),
    ...(input.data.title !== undefined ? { title: input.data.title } : {}),
    ...(input.data.entryDate !== undefined ? { entryDate: input.data.entryDate } : {}),
  };

  const updatedDocuments = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    if (lockedLedger.mainCurrency !== input.plan.mainCurrency) {
      throw new ConflictError("Ledger currency changed before the date update");
    }

    const lockedDocument = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.sourceDocumentId
    );
    if (
      lockedDocument.type !== input.initialDocument.type ||
      lockedDocument.activeRevisionId !== input.initialDocument.activeRevisionId ||
      lockedDocument.pendingRevisionId !== input.initialDocument.pendingRevisionId
    ) {
      throw new ConflictError("Source document changed before the date update");
    }

    const currentEntries = await loadProjectionEntriesForDocuments(tx, input.ledgerId, [
      input.sourceDocumentId,
    ]);
    if (projectionEntriesChanged(input.plan.initialEntries, currentEntries)) {
      throw new ConflictError("Ledger entries changed before the date update");
    }
    await updateProjectionConversions(tx, input.ledgerId, currentEntries, input.plan.conversions);

    return tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId))
      .returning({ id: sourceDocuments.id });
  });

  return updatedDocuments.length > 0;
}

export async function updateSourceDocument({
  ledgerId,
  sourceDocumentId,
  data,
}: UpdateSourceDocumentInput): Promise<UpdateSourceDocumentResultDto> {
  const document = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
    columns: {
      type: true,
      activeRevisionId: true,
      pendingRevisionId: true,
    },
  });
  if (document == null) {
    return { sourceDocumentId, updated: false };
  }

  if (document.type === "manual" && document.activeRevisionId != null) {
    if (data.entryDate === undefined) {
      const activeEntries = await db.query.ledgerEntries.findMany({
        where: and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
          eq(ledgerEntries.sourceDocumentRevisionId, document.activeRevisionId),
          isNull(ledgerEntries.deletedAt)
        ),
        orderBy: (entries, { asc: orderAscending }) => [
          orderAscending(entries.createdAt),
          orderAscending(entries.id),
        ],
      });
      await postgresLedgerProjectionAdapter.replaceManual({
        ledgerId,
        sourceDocumentId,
        expectedActiveRevisionId: document.activeRevisionId,
        ...(data.title !== undefined ? { title: data.title } : {}),
        entries: activeEntries.map((entry) => ({
          id: entry.id,
          categoryId: entry.categoryId,
          amount: entry.amount,
          currency: entry.currency,
          itemName: entry.itemName,
          description: entry.description,
          convertedAmount: entry.convertedAmount,
          exchangeRate: entry.exchangeRate,
          createdAt: entry.createdAt.toISOString(),
        })),
      });
      return { sourceDocumentId, updated: true };
    }

    const plan = await prepareDateReestimate(ledgerId, [sourceDocumentId], data.entryDate);
    const conversionByEntryId = new Map(
      plan.initialEntries.map((entry, index) => [entry.id, plan.conversions[index]!] as const)
    );
    const activeEntries = plan.initialEntries.filter(
      (entry) => entry.sourceDocumentRevisionId === document.activeRevisionId
    );
    await postgresLedgerProjectionAdapter.replaceManual({
      ledgerId,
      sourceDocumentId,
      expectedActiveRevisionId: document.activeRevisionId,
      expectedMainCurrency: plan.mainCurrency,
      expectedProjection: plan.initialEntries.map(toFingerprint),
      projectionConversions: plan.initialEntries.map((entry, index) => ({
        ledgerEntryId: entry.id,
        convertedAmount: round(plan.conversions[index]!.convertedAmount, 2),
        exchangeRate: round(plan.conversions[index]!.exchangeRate, 6),
      })),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
      entries: activeEntries.map((entry) => {
        const conversion = conversionByEntryId.get(entry.id);
        if (conversion == null)
          throw new ConflictError("Ledger entries changed before the date update");
        return toManualProjectionEntry(entry, conversion);
      }),
    });
    return { sourceDocumentId, updated: true };
  }

  if (data.entryDate !== undefined) {
    const plan = await prepareDateReestimate(ledgerId, [sourceDocumentId], data.entryDate);
    const updated = await updateNonManualDocumentWithDate({
      ledgerId,
      sourceDocumentId,
      data,
      initialDocument: document,
      plan,
    });
    return { sourceDocumentId, updated };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
  };
  const updatedDocuments = await db.transaction(async (tx) => {
    await lockLedgerForUpdate(tx, ledgerId);
    await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
    return tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
      .returning({ id: sourceDocuments.id });
  });

  return {
    sourceDocumentId,
    updated: updatedDocuments.length > 0,
  };
}

export async function batchUpdateSourceDocuments({
  ledgerId,
  sourceDocumentIds,
  data,
}: BatchUpdateSourceDocumentsInput): Promise<BatchUpdateSourceDocumentsResultDto> {
  if (sourceDocumentIds.length === 0) {
    return {
      sourceDocumentIds,
      updatedCount: 0,
    };
  }

  const requestedIds = [...new Set(sourceDocumentIds)].sort();
  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  const initialDocuments =
    data.entryDate === undefined
      ? []
      : await db
          .select({
            id: sourceDocuments.id,
            type: sourceDocuments.type,
            activeRevisionId: sourceDocuments.activeRevisionId,
            pendingRevisionId: sourceDocuments.pendingRevisionId,
          })
          .from(sourceDocuments)
          .where(
            and(
              eq(sourceDocuments.ledgerId, ledgerId),
              inArray(sourceDocuments.id, requestedIds),
              isNull(sourceDocuments.deletedAt)
            )
          )
          .orderBy(asc(sourceDocuments.id));
  const plan =
    data.entryDate === undefined
      ? null
      : await prepareDateReestimate(ledgerId, requestedIds, data.entryDate);

  const updatedDocuments = await db.transaction(async (tx) => {
    if (plan != null) {
      const lockedLedger = await lockLedgerForUpdate(tx, ledgerId);
      if (lockedLedger.mainCurrency !== plan.mainCurrency) {
        throw new ConflictError("Ledger currency changed before the batch edit");
      }
    } else {
      await lockLedgerForUpdate(tx, ledgerId);
    }

    const documents = await tx
      .select({
        id: sourceDocuments.id,
        type: sourceDocuments.type,
        activeRevisionId: sourceDocuments.activeRevisionId,
        pendingRevisionId: sourceDocuments.pendingRevisionId,
      })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, ledgerId),
          inArray(sourceDocuments.id, requestedIds),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .orderBy(asc(sourceDocuments.id))
      .for("update");
    if (documents.length !== requestedIds.length) {
      throw new ConflictError("Source documents changed before the batch edit");
    }

    if (plan != null) {
      if (
        initialDocuments.length !== documents.length ||
        initialDocuments.some((initial, index) => {
          const current = documents[index];
          return (
            current == null ||
            initial.id !== current.id ||
            initial.type !== current.type ||
            initial.activeRevisionId !== current.activeRevisionId ||
            initial.pendingRevisionId !== current.pendingRevisionId
          );
        })
      ) {
        throw new ConflictError("Source documents changed before the batch edit");
      }

      const projectionEntries = await loadProjectionEntriesForDocuments(tx, ledgerId, requestedIds);
      if (projectionEntriesChanged(plan.initialEntries, projectionEntries)) {
        throw new ConflictError("Ledger entries changed before the date update");
      }
      await updateProjectionConversions(tx, ledgerId, projectionEntries, plan.conversions);
    }

    const updated = await tx
      .update(sourceDocuments)
      .set(updatePatch)
      .where(
        and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, requestedIds))
      )
      .returning({ id: sourceDocuments.id });
    if (updated.length !== requestedIds.length) {
      throw new ConflictError("Source documents changed during the batch edit");
    }
    return updated;
  });

  return {
    sourceDocumentIds: requestedIds,
    updatedCount: updatedDocuments.length,
  };
}

function loadProjectionEntriesForDocuments(
  executor: QueryExecutor,
  ledgerId: string,
  sourceDocumentIds: readonly string[]
) {
  return executor
    .select({
      id: ledgerEntries.id,
      sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
      categoryId: ledgerEntries.categoryId,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      itemName: ledgerEntries.itemName,
      description: ledgerEntries.description,
      convertedAmount: ledgerEntries.convertedAmount,
      exchangeRate: ledgerEntries.exchangeRate,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt),
        or(
          eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.activeRevisionId),
          eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.pendingRevisionId)
        )
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        inArray(ledgerEntries.sourceDocumentId, [...sourceDocumentIds]),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .orderBy(ledgerEntries.id);
}
