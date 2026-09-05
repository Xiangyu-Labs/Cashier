import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { compare, round } from "@/lib/money/decimal";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import type { LedgerProjectionEntryContract } from "@/application/contracts";
import type {
  BatchUpdateSourceDocumentsResultDto,
  SaveSourceDocumentChangesResultDto,
} from "@/modules/source-document/contracts";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "@/modules/source-document/contract-schemas";
import { postgresFxRateBook } from "./exchange-rate";
import { replaceActiveProjectionInTransaction } from "./ledger-projections";
import {
  lockLedgerForUpdate,
  lockSourceDocumentForUpdate,
  lockSourceDocumentsForUpdate,
} from "./transaction-locks";
import type { UpdateLedgerEntryInput } from "@/modules/ledger/contract-schemas";
import type { BatchEntryDateImpact } from "@/modules/ledger/application/ports";
import { hasEditableActiveProjection } from "./source-document-write-guards";

function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt))!;
}

function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(whereSourceDocumentNotDeleted(ledgerId), eq(sourceDocuments.id, sourceDocumentId))!;
}

interface BatchUpdateSourceDocumentsInput {
  ledgerId: string;
  targets: import("@/modules/source-document/contracts").VersionedTarget[];
  data: BatchUpdateSourceDocumentsPayload;
  ledgerEntryIds?: string[];
}

interface SaveSourceDocumentChangesAdapterInput {
  ledgerId: string;
  sourceDocumentId: string;
  expectedVersion: number;
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

export async function saveSourceDocumentChangesAtomically(
  input: SaveSourceDocumentChangesAdapterInput
): Promise<
  import("@/modules/source-document/contracts").VersionedCommandResult<SaveSourceDocumentChangesResultDto>
> {
  const [ledger, document, initialEntries] = await Promise.all([
    db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, input.ledgerId), isNull(ledgers.deletedAt)),
      columns: { mainCurrency: true },
    }),
    db.query.sourceDocuments.findFirst({
      where: whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId),
      columns: {
        activeRevisionId: true,
        pendingRevisionId: true,
        currentStatus: true,
        stateVersion: true,
        title: true,
        entryDate: true,
      },
    }),
    db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        eq(ledgerEntries.sourceDocumentId, input.sourceDocumentId),
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
  if (document.stateVersion !== input.expectedVersion) {
    return {
      ok: false,
      reason: "stale",
      sourceDocumentId: input.sourceDocumentId,
      expectedVersion: input.expectedVersion,
      currentVersion: document.stateVersion,
    };
  }
  if (!hasEditableActiveProjection(document)) {
    throw new ConflictError("Source document is not editable");
  }
  const activeEntries = initialEntries.filter(
    (entry) => entry.sourceDocumentRevisionId === document.activeRevisionId
  );

  const patches = new Map(input.entries.map((entry) => [entry.ledgerEntryId, entry.data]));
  if (patches.size !== input.entries.length) {
    throw new ConflictError("A ledger entry may only be updated once");
  }
  const initialEntriesById = new Map(activeEntries.map((entry) => [entry.id, entry]));
  for (const entryId of patches.keys()) {
    if (!initialEntriesById.has(entryId)) {
      throw new NotFoundError("Active ledger entry projection");
    }
  }

  const metadataChanged =
    (input.sourceDocument?.title !== undefined && input.sourceDocument.title !== document.title) ||
    (input.sourceDocument?.entryDate !== undefined &&
      input.sourceDocument.entryDate !== document.entryDate);
  const entriesChanged = input.entries.some(({ ledgerEntryId, data }) => {
    const entry = initialEntriesById.get(ledgerEntryId)!;
    const nextCurrency = data.currency !== undefined ? data.currency : entry.currency;
    const effectiveCurrency = normalizeCurrency(nextCurrency, ledger.mainCurrency);
    return (
      (data.categoryId !== undefined && data.categoryId !== entry.categoryId) ||
      (data.amount !== undefined &&
        compare(roundToCurrency(String(data.amount), effectiveCurrency), entry.amount) !== 0) ||
      (data.currency !== undefined && data.currency !== entry.currency) ||
      (data.itemName !== undefined && data.itemName !== entry.itemName) ||
      (data.description !== undefined && data.description !== entry.description)
    );
  });
  if (!metadataChanged && !entriesChanged) {
    return {
      ok: true,
      sourceDocumentId: input.sourceDocumentId,
      version: input.expectedVersion,
      data: { updatedEntryIds: input.entries.map((entry) => entry.ledgerEntryId) },
    };
  }

  const nextEntryDate = input.sourceDocument?.entryDate ?? document.entryDate ?? undefined;
  const nextEntries = activeEntries.map((entry) => {
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

  const committed = await db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    if (lockedLedger.mainCurrency !== ledger.mainCurrency) {
      throw new ConflictError("Ledger currency changed before the edit");
    }
    const lockedDocument = await lockSourceDocumentForUpdate(
      tx,
      input.ledgerId,
      input.sourceDocumentId
    );
    if (lockedDocument.stateVersion !== input.expectedVersion) {
      return false;
    }
    if (!hasEditableActiveProjection(lockedDocument)) {
      throw new ConflictError("Source document is not editable");
    }

    await replaceActiveProjectionInTransaction(tx, {
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      expectedActiveRevisionId: lockedDocument.activeRevisionId,
      expectedStateVersion: input.expectedVersion,
      revisionId: crypto.randomUUID(),
      entries: projection,
      ...(input.sourceDocument?.title === undefined ? {} : { title: input.sourceDocument.title }),
      ...(input.sourceDocument?.entryDate === undefined
        ? {}
        : { entryDate: input.sourceDocument.entryDate }),
    });
    return true;
  });

  if (!committed) {
    const current = await db.query.sourceDocuments.findFirst({
      where: whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId),
      columns: { stateVersion: true },
    });
    if (current == null) throw new NotFoundError("Source document");
    return {
      ok: false,
      reason: "stale",
      sourceDocumentId: input.sourceDocumentId,
      expectedVersion: input.expectedVersion,
      currentVersion: current.stateVersion,
    };
  }
  return {
    ok: true,
    sourceDocumentId: input.sourceDocumentId,
    version: input.expectedVersion + 1,
    data: { updatedEntryIds: input.entries.map((entry) => entry.ledgerEntryId) },
  };
}

export async function batchUpdateSourceDocuments({
  ledgerId,
  targets,
  data,
  ledgerEntryIds: selectedLedgerEntryIds,
}: BatchUpdateSourceDocumentsInput): Promise<
  import("@/modules/source-document/contracts").AtomicBatchCommandResult<
    BatchUpdateSourceDocumentsResultDto & { impact?: BatchEntryDateImpact }
  >
> {
  const requestedIds = targets.map((target) => target.sourceDocumentId);
  const expectedVersions = new Map(
    targets.map((target) => [target.sourceDocumentId, target.expectedVersion] as const)
  );

  const initialDocuments = await db
    .select({
      id: sourceDocuments.id,
      type: sourceDocuments.type,
      activeRevisionId: sourceDocuments.activeRevisionId,
      pendingRevisionId: sourceDocuments.pendingRevisionId,
      currentStatus: sourceDocuments.currentStatus,
      stateVersion: sourceDocuments.stateVersion,
      title: sourceDocuments.title,
      entryDate: sourceDocuments.entryDate,
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
  const initialStaleTargets = initialDocuments.flatMap((document) => {
    const expectedVersion = expectedVersions.get(document.id)!;
    return document.stateVersion === expectedVersion
      ? []
      : [{ sourceDocumentId: document.id, expectedVersion, currentVersion: document.stateVersion }];
  });
  if (initialStaleTargets.length > 0) {
    return { ok: false as const, reason: "stale" as const, staleTargets: initialStaleTargets };
  }
  if (
    initialDocuments.length !== requestedIds.length ||
    initialDocuments.some((document) => !hasEditableActiveProjection(document))
  ) {
    throw new ConflictError("Source document is not editable");
  }
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

    let documents: Array<typeof sourceDocuments.$inferSelect>;
    try {
      documents = await lockSourceDocumentsForUpdate(tx, ledgerId, requestedIds);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new ConflictError("Source documents changed before the batch edit");
      }
      throw error;
    }
    const staleTargets = documents.flatMap((document) => {
      const expectedVersion = expectedVersions.get(document.id)!;
      return document.stateVersion === expectedVersion
        ? []
        : [
            {
              sourceDocumentId: document.id,
              expectedVersion,
              currentVersion: document.stateVersion,
            },
          ];
    });
    if (staleTargets.length > 0) {
      return { changedIds: new Set<string>(), impact: undefined, staleTargets };
    }
    if (documents.some((document) => !hasEditableActiveProjection(document))) {
      throw new ConflictError("Source document is not editable");
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
      // Every requested document must be in a valid state for the batch to
      // commit — but only documents whose title or date actually changes get
      // a new revision; a document already at the target date/title is a
      // true no-op and keeps its current version untouched.
      const changedDocuments = documents.filter((document) => {
        return (
          (data.title !== undefined && data.title !== document.title) ||
          data.entryDate !== document.entryDate
        );
      });
      for (const document of changedDocuments) {
        const entries = projectionEntries.filter((entry) => entry.sourceDocumentId === document.id);
        await replaceActiveProjectionInTransaction(tx, {
          ledgerId,
          sourceDocumentId: document.id,
          expectedActiveRevisionId: document.activeRevisionId!,
          expectedStateVersion: document.stateVersion,
          revisionId: crypto.randomUUID(),
          entryDate: data.entryDate!,
          ...(data.title === undefined ? {} : { title: data.title }),
          entries: entries.map((entry) => {
            const conversion = conversionByEntryId.get(entry.id);
            if (conversion == null) {
              throw new ConflictError("Ledger entries changed before the date update");
            }
            return toManualProjectionEntry(entry, conversion, plan.mainCurrency);
          }),
        });
      }
      return {
        changedIds: new Set(changedDocuments.map((document) => document.id)),
        impact,
        staleTargets: [],
      };
    }

    // Title-only batch: only documents whose title actually differs get a
    // single-writer `+1`; documents already at the target title are no-ops.
    const changedDocuments = documents.filter(
      (document) => data.title !== undefined && data.title !== document.title
    );
    if (changedDocuments.length > 0) {
      const updated = await tx
        .update(sourceDocuments)
        .set({
          title: data.title,
          stateVersion: sql`${sourceDocuments.stateVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            whereSourceDocumentNotDeleted(ledgerId),
            inArray(
              sourceDocuments.id,
              changedDocuments.map((document) => document.id)
            )
          )
        )
        .returning({ id: sourceDocuments.id });
      if (updated.length !== changedDocuments.length) {
        throw new ConflictError("Source documents changed during the batch edit");
      }
    }
    return {
      changedIds: new Set(changedDocuments.map((document) => document.id)),
      impact,
      staleTargets: [],
    };
  });

  if (transactionResult.staleTargets.length > 0) {
    return {
      ok: false as const,
      reason: "stale" as const,
      staleTargets: transactionResult.staleTargets,
    };
  }

  return {
    ok: true as const,
    versions: targets.map((target) => ({
      sourceDocumentId: target.sourceDocumentId,
      version: transactionResult.changedIds.has(target.sourceDocumentId)
        ? target.expectedVersion + 1
        : target.expectedVersion,
    })),
    data: {
      sourceDocumentIds: requestedIds,
      updatedCount: transactionResult.changedIds.size,
      ...(transactionResult.impact == null ? {} : { impact: transactionResult.impact }),
    },
  };
}

export async function updateLedgerEntryDatesAtomically(input: {
  ledgerId: string;
  targets: import("@/modules/source-document/contracts").VersionedTarget[];
  ledgerEntryIds: string[];
  entryDate: string;
}): Promise<
  import("@/modules/source-document/contracts").AtomicBatchCommandResult<{
    impact: BatchEntryDateImpact;
  }>
> {
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
  const targetIds = input.targets.map((target) => target.sourceDocumentId);
  if (
    sourceDocumentIds.length !== targetIds.length ||
    sourceDocumentIds.some((id, index) => id !== targetIds[index])
  ) {
    throw new NotFoundError("Source document target");
  }
  const result = await batchUpdateSourceDocuments({
    ledgerId: input.ledgerId,
    targets: input.targets,
    ledgerEntryIds: selectedIds,
    data: { entryDate: input.entryDate },
  });
  if (!result.ok) return result;
  if (result.data.impact == null) throw new ConflictError("Date update impact was not committed");
  return { ok: true, versions: result.versions, data: { impact: result.data.impact } };
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
