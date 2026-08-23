import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import type {
  LedgerProjectionEntryContract,
  LedgerProjectionEntryFingerprint,
} from "@/application/contracts";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SaveSourceDocumentChangesResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "@/modules/source-document/contract-schemas";
import { postgresFxRateBook } from "./exchange-rate";
import { postgresLedgerProjectionAdapter } from "./ledger-projections";
import { replaceActiveProjectionInTransaction } from "./ledger-projections";
import { lockLedgerForUpdate, lockSourceDocumentForUpdate } from "./transaction-locks";
import type { UpdateLedgerEntryInput } from "@/modules/ledger/contract-schemas";
import { getTargetSourceDocument } from "./read-models";
import { listLedgerEntryViewsBySourceDocumentIds } from "./ledger-reads/list-ledger-entry-views-by-source-document-ids";
import type { BatchEntryDateImpact } from "@/modules/ledger/application/ports";

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
  ledgerEntryIds?: string[];
}

interface SaveSourceDocumentChangesAdapterInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedRevisionId: string;
  operationId: string;
  sourceDocument?: UpdateSourceDocumentPayload;
  entries: Array<{ ledgerEntryId: string; data: UpdateLedgerEntryInput }>;
}

type ProjectionEntrySnapshot = {
  id: string;
  sourceDocumentId: string | null;
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

type QueryExecutor = Pick<typeof db, "select">;

function normalizeCurrency(currency: string | null, fallback = "CNY"): string {
  return currency != null && currency !== "" ? currency : fallback;
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
  const ledger = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    columns: { mainCurrency: true },
  });
  if (ledger == null) throw new ConflictError("Ledger changed before the date update");
  const initialEntries = await loadProjectionEntriesForDocuments(db, ledgerId, sourceDocumentIds);

  const conversions = await postgresFxRateBook.convertBatch(
    initialEntries.map((entry) => ({
      amount: entry.amount,
      from: normalizeCurrency(entry.currency, ledger.mainCurrency),
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

function toManualProjectionEntry(
  entry: ProjectionEntrySnapshot,
  conversion: { convertedAmount: string; exchangeRate: string },
  mainCurrency: string
): LedgerProjectionEntryContract {
  return {
    id: entry.id,
    categoryId: entry.categoryId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: roundToCurrency(conversion.convertedAmount, mainCurrency),
    exchangeRate: round(conversion.exchangeRate, 12),
    createdAt: entry.createdAt.toISOString(),
  };
}

async function loadAuthoritativeSourceDocument(
  ledgerId: string,
  sourceDocumentId: string,
  activeRevisionId: string
): Promise<SaveSourceDocumentChangesResultDto> {
  const [sourceDocument, entriesByDocument] = await Promise.all([
    getTargetSourceDocument(ledgerId, sourceDocumentId),
    listLedgerEntryViewsBySourceDocumentIds({
      ledgerId,
      sourceDocumentIds: [sourceDocumentId],
      includeDuplicatePending: true,
    }),
  ]);
  if (sourceDocument == null) throw new NotFoundError("Source document");
  return {
    activeRevisionId,
    sourceDocument: {
      ...sourceDocument,
      activeRevisionId,
      ledgerEntries: entriesByDocument.get(sourceDocumentId) ?? [],
    },
  };
}

export async function saveSourceDocumentChangesAtomically(
  input: SaveSourceDocumentChangesAdapterInput
): Promise<SaveSourceDocumentChangesResultDto> {
  const [ledger, document, initialEntries] = await Promise.all([
    db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, input.ledgerId), isNull(ledgers.deletedAt)),
      columns: { mainCurrency: true },
    }),
    db.query.sourceDocuments.findFirst({
      where: whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId),
      columns: {
        activeRevisionId: true,
        entryDate: true,
      },
    }),
    db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, input.expectedRevisionId),
        isNull(ledgerEntries.deletedAt)
      ),
      orderBy: (entries, { asc: orderAscending }) => [
        orderAscending(entries.position),
        orderAscending(entries.createdAt),
        orderAscending(entries.id),
      ],
    }),
  ]);
  if (ledger == null || document == null) throw new NotFoundError("Source document");
  if (document.activeRevisionId === input.operationId) {
    return loadAuthoritativeSourceDocument(
      input.ledgerId,
      input.sourceDocumentId,
      input.operationId
    );
  }
  if (document.activeRevisionId !== input.expectedRevisionId) {
    throw new ConflictError("Source document active revision changed");
  }

  const patches = new Map(input.entries.map((entry) => [entry.ledgerEntryId, entry.data]));
  if (patches.size !== input.entries.length) {
    throw new ConflictError("A ledger entry may only be updated once");
  }
  const initialEntriesById = new Map(initialEntries.map((entry) => [entry.id, entry]));
  for (const entryId of patches.keys()) {
    if (!initialEntriesById.has(entryId)) {
      throw new NotFoundError("Active ledger entry projection");
    }
  }

  const nextEntryDate = input.sourceDocument?.entryDate ?? document.entryDate ?? undefined;
  const nextEntries = initialEntries.map((entry) => {
    const patch = patches.get(entry.id);
    return {
      id: entry.id,
      categoryId: patch?.categoryId !== undefined ? patch.categoryId : entry.categoryId,
      amount: roundToCurrency(
        patch?.amount !== undefined ? String(patch.amount) : entry.amount,
        normalizeCurrency(
          patch?.currency !== undefined ? patch.currency : entry.currency,
          ledger.mainCurrency
        )
      ),
      currency: patch?.currency !== undefined ? patch.currency : entry.currency,
      itemName: patch?.itemName !== undefined ? patch.itemName : entry.itemName,
      description: patch?.description !== undefined ? patch.description : entry.description,
      createdAt: entry.createdAt.toISOString(),
    };
  });
  const conversions = await postgresFxRateBook.convertBatch(
    nextEntries.map((entry) => ({
      amount: entry.amount,
      from: normalizeCurrency(entry.currency, ledger.mainCurrency),
      ...(nextEntryDate == null || nextEntryDate === "" ? {} : { date: nextEntryDate }),
    })),
    ledger.mainCurrency
  );
  const projection = nextEntries.map((entry, index) => ({
    ...entry,
    convertedAmount: roundToCurrency(conversions[index]!.convertedAmount, ledger.mainCurrency),
    exchangeRate: round(conversions[index]!.exchangeRate, 12),
  }));

  const activeRevisionId = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    if (lockedLedger.mainCurrency !== ledger.mainCurrency) {
      throw new ConflictError("Ledger currency changed before the edit");
    }
    const lockedDocument = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.sourceDocumentId
    );
    if (lockedDocument.activeRevisionId === input.operationId) return input.operationId;
    if (lockedDocument.activeRevisionId !== input.expectedRevisionId) {
      throw new ConflictError("Source document active revision changed");
    }

    return replaceActiveProjectionInTransaction(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      expectedActiveRevisionId: input.expectedRevisionId,
      revisionId: input.operationId,
      entries: projection,
      ...(input.sourceDocument?.title === undefined ? {} : { title: input.sourceDocument.title }),
      ...(input.sourceDocument?.entryDate === undefined
        ? {}
        : { entryDate: input.sourceDocument.entryDate }),
    });
  });

  return loadAuthoritativeSourceDocument(input.ledgerId, input.sourceDocumentId, activeRevisionId);
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
    if (
      lockedDocument.activeRevisionId == null &&
      lockedDocument.pendingRevisionId == null &&
      currentEntries.length === 0
    ) {
      return tx
        .update(sourceDocuments)
        .set({
          updatedAt: new Date(),
          ...(input.data.title === undefined ? {} : { title: input.data.title }),
          ...(input.data.entryDate === undefined ? {} : { entryDate: input.data.entryDate }),
        })
        .where(whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId))
        .returning({ id: sourceDocuments.id });
    }
    if (lockedDocument.activeRevisionId == null || lockedDocument.pendingRevisionId != null) {
      throw new ConflictError("Source document has processing work");
    }
    await replaceActiveProjectionInTransaction(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      expectedActiveRevisionId: lockedDocument.activeRevisionId,
      revisionId: crypto.randomUUID(),
      entries: currentEntries.map((entry, index) =>
        toManualProjectionEntry(entry, input.plan.conversions[index]!, input.plan.mainCurrency)
      ),
      ...(input.data.title === undefined ? {} : { title: input.data.title }),
      ...(input.data.entryDate === undefined ? {} : { entryDate: input.data.entryDate }),
    });
    return [{ id: input.sourceDocumentId }];
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
      const updated = await db.transaction(async (tx) => {
        await lockLedgerForUpdate(tx, ledgerId);
        const locked = await lockSourceDocumentForUpdate(tx, ledgerId, sourceDocumentId);
        if (locked.activeRevisionId !== document.activeRevisionId || locked.type !== "manual") {
          throw new ConflictError("Source document changed before the title update");
        }
        return tx
          .update(sourceDocuments)
          .set({ title: data.title!, updatedAt: new Date() })
          .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
          .returning({ id: sourceDocuments.id });
      });
      return { sourceDocumentId, updated: updated.length === 1 };
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
        convertedAmount: roundToCurrency(
          plan.conversions[index]!.convertedAmount,
          plan.mainCurrency
        ),
        exchangeRate: round(plan.conversions[index]!.exchangeRate, 12),
      })),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
      entries: activeEntries.map((entry) => {
        const conversion = conversionByEntryId.get(entry.id);
        if (conversion == null)
          throw new ConflictError("Ledger entries changed before the date update");
        return toManualProjectionEntry(entry, conversion, plan.mainCurrency);
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
  ledgerEntryIds: selectedLedgerEntryIds,
}: BatchUpdateSourceDocumentsInput): Promise<
  BatchUpdateSourceDocumentsResultDto & { impact?: BatchEntryDateImpact }
> {
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

  const transactionResult = await db.transaction(async (tx) => {
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

    let impact: BatchEntryDateImpact | undefined;
    if (selectedLedgerEntryIds != null) {
      const selectedIds = [...new Set(selectedLedgerEntryIds)].sort();
      const selected = await tx
        .select({ id: ledgerEntries.id, sourceDocumentId: ledgerEntries.sourceDocumentId })
        .from(ledgerEntries)
        .innerJoin(
          sourceDocuments,
          and(
            eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
            eq(sourceDocuments.ledgerId, ledgerId),
            eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            inArray(ledgerEntries.id, selectedIds),
            isNull(ledgerEntries.deletedAt)
          )
        );
      const selectedDocumentIds = [
        ...new Set(
          selected.flatMap((entry) =>
            entry.sourceDocumentId == null ? [] : [entry.sourceDocumentId]
          )
        ),
      ].sort();
      if (
        selected.length !== selectedIds.length ||
        selectedDocumentIds.length !== requestedIds.length ||
        selectedDocumentIds.some((id, index) => id !== requestedIds[index])
      ) {
        throw new ConflictError("Selected ledger entries changed before the date update");
      }
      const affected = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .innerJoin(
          sourceDocuments,
          and(
            eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
            eq(sourceDocuments.ledgerId, ledgerId),
            eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
            isNull(sourceDocuments.deletedAt)
          )
        )
        .where(
          and(
            eq(ledgerEntries.ledgerId, ledgerId),
            inArray(ledgerEntries.sourceDocumentId, requestedIds),
            isNull(ledgerEntries.deletedAt)
          )
        );
      impact = {
        selectedEntryCount: selected.length,
        sourceDocumentCount: requestedIds.length,
        affectedEntryCount: affected.length,
        sourceDocumentIds: requestedIds,
      };
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
      const conversionByEntryId = new Map(
        projectionEntries.map((entry, index) => [entry.id, plan.conversions[index]!] as const)
      );
      for (const document of documents) {
        if (document.activeRevisionId == null || document.pendingRevisionId != null) {
          throw new ConflictError("Source document has processing work");
        }
        const entries = projectionEntries.filter((entry) => entry.sourceDocumentId === document.id);
        await replaceActiveProjectionInTransaction(tx, {
          ledgerId,
          sourceDocumentId: document.id,
          expectedActiveRevisionId: document.activeRevisionId,
          revisionId: crypto.randomUUID(),
          entryDate: data.entryDate!,
          entries: entries.map((entry) => {
            const conversion = conversionByEntryId.get(entry.id);
            if (conversion == null) {
              throw new ConflictError("Ledger entries changed before the date update");
            }
            return toManualProjectionEntry(entry, conversion, plan.mainCurrency);
          }),
        });
      }
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
    return { updated, impact };
  });

  return {
    sourceDocumentIds: requestedIds,
    updatedCount: transactionResult.updated.length,
    ...(transactionResult.impact == null ? {} : { impact: transactionResult.impact }),
  };
}

export async function updateLedgerEntryDatesAtomically(input: {
  ledgerId: string;
  ledgerEntryIds: string[];
  entryDate: string;
}): Promise<BatchEntryDateImpact> {
  const selectedIds = [...new Set(input.ledgerEntryIds)].sort();
  const selected = await db
    .select({ id: ledgerEntries.id, sourceDocumentId: ledgerEntries.sourceDocumentId })
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
        inArray(ledgerEntries.id, selectedIds),
        isNull(ledgerEntries.deletedAt)
      )
    );
  if (selected.length !== selectedIds.length) throw new NotFoundError("Selected ledger entry");
  const sourceDocumentIds = [
    ...new Set(
      selected.flatMap((entry) => (entry.sourceDocumentId == null ? [] : [entry.sourceDocumentId]))
    ),
  ].sort();
  const result = await batchUpdateSourceDocuments({
    ledgerId: input.ledgerId,
    sourceDocumentIds,
    ledgerEntryIds: selectedIds,
    data: { entryDate: input.entryDate },
  });
  if (result.impact == null) throw new ConflictError("Date update impact was not committed");
  return result.impact;
}

function loadProjectionEntriesForDocuments(
  executor: QueryExecutor,
  ledgerId: string,
  sourceDocumentIds: readonly string[]
) {
  return executor
    .select({
      id: ledgerEntries.id,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
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
        eq(ledgerEntries.sourceDocumentRevisionId, sourceDocuments.activeRevisionId)
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        inArray(ledgerEntries.sourceDocumentId, [...sourceDocumentIds]),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .orderBy(ledgerEntries.sourceDocumentId, ledgerEntries.position, ledgerEntries.id);
}
