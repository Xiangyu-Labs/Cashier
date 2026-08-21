import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ensureTargetLedgerProjection,
  LedgerMainCurrencyChangedError,
  postgresLedgerProjectionAdapter,
} from "@/application/adapters/postgres/ledger-projections";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { round } from "@/lib/money/decimal";
import { roundToCurrency } from "@/lib/money/currency-precision";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { getLedgerEntryDetail } from "./ledger-reads/get-ledger-entry-detail";
import { lockLedgerForUpdate } from "./transaction-locks";
import { postgresFxRateBook } from "./exchange-rate";
import { ConflictError } from "@/lib/errors";
import { postgresSettingsAdapter } from "./business-ports";
import type { BatchActionResult } from "@/lib/batch-ids";
import { convertWithRates } from "@/modules/currency/application/services/rate-calculation";

function normalizeCurrency(value: string | null | undefined): string {
  return value != null && value !== "" ? value : "CNY";
}

async function convertEntryAmount(input: {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}) {
  if (input.fromCurrency === input.toCurrency) {
    return {
      convertedAmount: roundToCurrency(input.amount, input.toCurrency),
      exchangeRate: "1",
    };
  }
  const rates = await postgresFxRateBook.getRates(input.date);
  return convertWithRates(input.amount, rates, input.fromCurrency, input.toCurrency);
}

async function getLedgerMainCurrency(ledgerId: string): Promise<string> {
  return (await postgresSettingsAdapter.get(ledgerId))?.mainCurrency ?? "CNY";
}

function whereActiveSourceDocumentForLedger(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    eq(sourceDocuments.ledgerId, ledgerId),
    isNull(sourceDocuments.deletedAt)
  )!;
}

export async function createLedgerEntryWithConversion(input: {
  ledgerId: string;
  ledgerEntryId?: string;
  amount: string;
  currency?: string;
  itemName: string;
  categoryId?: string;
  description?: string | null;
  sourceDocumentId: string;
}): Promise<LedgerEntryDto> {
  return createLedgerEntryAttempt(input, true);
}

async function createLedgerEntryAttempt(
  input: {
    ledgerId: string;
    ledgerEntryId?: string;
    amount: string;
    currency?: string;
    itemName: string;
    categoryId?: string;
    description?: string | null;
    sourceDocumentId: string;
  },
  retryOnCurrencyChange: boolean
): Promise<LedgerEntryDto> {
  if (input.ledgerEntryId !== undefined) {
    const existing = await getLedgerEntryDetail(input.ledgerEntryId, input.ledgerId);
    if (existing != null) return existing;
  }
  const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const entryCurrency = normalizeCurrency(input.currency);

  let sourceDoc = await db.query.sourceDocuments.findFirst({
    where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
    columns: { activeRevisionId: true, entryDate: true },
  });

  if (sourceDoc == null) {
    throw new NotFoundError("Source document");
  }

  const entryDate =
    sourceDoc.entryDate != null && sourceDoc.entryDate !== "" ? sourceDoc.entryDate : undefined;

  const conversion = await convertEntryAmount({
    amount: input.amount,
    fromCurrency: entryCurrency,
    toCurrency: mainCurrency,
    ...(entryDate !== undefined ? { date: entryDate } : {}),
  });

  if (sourceDoc.activeRevisionId == null) {
    await ensureTargetLedgerProjection(input.ledgerId, input.sourceDocumentId);
    sourceDoc = await db.query.sourceDocuments.findFirst({
      where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
      columns: { activeRevisionId: true, entryDate: true },
    });
  }
  if (sourceDoc?.activeRevisionId == null) throw new NotFoundError("Active source document");
  const activeEntries = await listActiveProjectionEntries(
    input.ledgerId,
    input.sourceDocumentId,
    sourceDoc.activeRevisionId
  );
  const ledgerEntryId = input.ledgerEntryId ?? crypto.randomUUID();
  try {
    await postgresLedgerProjectionAdapter.replaceActive({
      ledgerId: input.ledgerId,
      sourceDocumentId: input.sourceDocumentId,
      expectedActiveRevisionId: sourceDoc.activeRevisionId,
      expectedMainCurrency: mainCurrency,
      entries: [
        ...activeEntries.map(toProjectionEntry),
        {
          id: ledgerEntryId,
          amount: roundToCurrency(input.amount, entryCurrency),
          itemName: input.itemName,
          currency: entryCurrency,
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          convertedAmount: conversion?.convertedAmount ?? null,
          exchangeRate: conversion?.exchangeRate ?? null,
        },
      ],
    });
  } catch (error) {
    if (retryOnCurrencyChange && error instanceof LedgerMainCurrencyChangedError) {
      return createLedgerEntryAttempt(input, false);
    }
    throw error;
  }
  const created = await getLedgerEntryDetail(ledgerEntryId, input.ledgerId);
  if (created == null) throw new AppError("Failed to create ledger entry", "ENTRY_CREATE_FAILED");
  return created;
}

type ActiveProjectionEntry = typeof ledgerEntries.$inferSelect;

function toProjectionEntry(entry: ActiveProjectionEntry) {
  return {
    id: entry.id,
    categoryId: entry.categoryId,
    amount: entry.amount,
    currency: entry.currency,
    itemName: entry.itemName,
    description: entry.description,
    convertedAmount: entry.convertedAmount,
    exchangeRate: entry.exchangeRate,
    createdAt: entry.createdAt.toISOString(),
  };
}

async function listActiveProjectionEntries(
  ledgerId: string,
  sourceDocumentId: string,
  activeRevisionId: string
): Promise<ActiveProjectionEntry[]> {
  return db.query.ledgerEntries.findMany({
    where: and(
      eq(ledgerEntries.ledgerId, ledgerId),
      eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
      eq(ledgerEntries.sourceDocumentRevisionId, activeRevisionId),
      isNull(ledgerEntries.deletedAt)
    ),
    orderBy: (entries, { asc }) => [asc(entries.createdAt), asc(entries.id)],
  });
}

export async function updateLedgerEntryWithConversion(input: {
  ledgerId: string;
  ledgerEntryId: string;
  categoryId?: string | null;
  amount?: string;
  currency?: string | null;
  itemName?: string;
  description?: string | null;
}): Promise<LedgerEntryDto> {
  return updateLedgerEntryAttempt(input, true);
}

async function updateLedgerEntryAttempt(
  input: {
    ledgerId: string;
    ledgerEntryId: string;
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  },
  retryOnCurrencyChange: boolean
): Promise<LedgerEntryDto> {
  let targetEntry = await db.query.ledgerEntries.findFirst({
    where: and(
      eq(ledgerEntries.id, input.ledgerEntryId),
      eq(ledgerEntries.ledgerId, input.ledgerId),
      isNull(ledgerEntries.deletedAt)
    ),
    with: { sourceDocument: true },
  });
  if (targetEntry?.sourceDocument != null && targetEntry.sourceDocument.activeRevisionId == null) {
    await ensureTargetLedgerProjection(input.ledgerId, targetEntry.sourceDocument.id);
    targetEntry = await db.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.id, input.ledgerEntryId),
        eq(ledgerEntries.ledgerId, input.ledgerId),
        isNull(ledgerEntries.deletedAt)
      ),
      with: { sourceDocument: true },
    });
  }
  const targetDocument = targetEntry?.sourceDocument;
  if (
    targetEntry == null ||
    targetDocument == null ||
    targetDocument.activeRevisionId == null ||
    targetEntry.sourceDocumentRevisionId !== targetDocument.activeRevisionId
  ) {
    throw new NotFoundError("Active ledger entry projection");
  }
  const mainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const nextAmount = input.amount ?? targetEntry.amount;
  const nextCurrency = normalizeCurrency(input.currency ?? targetEntry.currency);
  let convertedAmount = targetEntry.convertedAmount;
  let exchangeRate = targetEntry.exchangeRate;
  if (input.amount !== undefined || input.currency !== undefined) {
    const conversion = await convertEntryAmount({
      amount: nextAmount,
      fromCurrency: nextCurrency,
      toCurrency: mainCurrency,
      ...(targetDocument.entryDate != null && targetDocument.entryDate !== ""
        ? { date: targetDocument.entryDate }
        : {}),
    });
    convertedAmount = conversion?.convertedAmount ?? null;
    exchangeRate = conversion?.exchangeRate ?? null;
  }
  const activeEntries = await listActiveProjectionEntries(
    input.ledgerId,
    targetDocument.id,
    targetDocument.activeRevisionId
  );
  try {
    await postgresLedgerProjectionAdapter.replaceActive({
      ledgerId: input.ledgerId,
      sourceDocumentId: targetDocument.id,
      expectedActiveRevisionId: targetDocument.activeRevisionId,
      expectedMainCurrency: mainCurrency,
      entries: activeEntries.map((entry) =>
        entry.id === input.ledgerEntryId
          ? {
              ...toProjectionEntry(entry),
              categoryId: input.categoryId !== undefined ? input.categoryId : entry.categoryId,
              amount:
                input.amount !== undefined
                  ? roundToCurrency(input.amount, nextCurrency)
                  : entry.amount,
              currency: input.currency !== undefined ? input.currency : entry.currency,
              itemName: input.itemName !== undefined ? input.itemName : entry.itemName,
              description: input.description !== undefined ? input.description : entry.description,
              convertedAmount,
              exchangeRate,
            }
          : toProjectionEntry(entry)
      ),
    });
  } catch (error) {
    if (retryOnCurrencyChange && error instanceof LedgerMainCurrencyChangedError) {
      return updateLedgerEntryAttempt(input, false);
    }
    throw error;
  }
  const updated = await getLedgerEntryDetail(input.ledgerEntryId, input.ledgerId);
  if (updated == null) throw new NotFoundError("Entry");
  return updated;
}

export async function batchUpdateLedgerEntries(input: {
  ledgerId: string;
  ledgerEntryIds: string[];
  categoryId?: string | null;
  currency?: string | null;
  amount?: string;
  description?: string | null;
  itemName?: string;
}): Promise<number> {
  if (input.ledgerEntryIds.length === 0) return 0;
  const requestedIds = [...new Set(input.ledgerEntryIds)].sort();
  const legacyDocuments = await db
    .select({
      id: sourceDocuments.id,
      activeRevisionId: sourceDocuments.activeRevisionId,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, input.ledgerId),
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
  for (const documentId of [
    ...new Set(
      legacyDocuments
        .filter((document) => document.activeRevisionId == null)
        .map((document) => document.id)
    ),
  ].sort()) {
    await ensureTargetLedgerProjection(input.ledgerId, documentId);
  }

  const initialMainCurrency = await getLedgerMainCurrency(input.ledgerId);
  const initialRows = await db
    .select({
      id: ledgerEntries.id,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
      activeRevisionId: sourceDocuments.activeRevisionId,
      entryDate: sourceDocuments.entryDate,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, input.ledgerId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, input.ledgerId),
        inArray(ledgerEntries.id, requestedIds),
        isNull(ledgerEntries.deletedAt)
      )
    )
    .orderBy(ledgerEntries.id);

  assertBatchRowsAreCurrent(initialRows, requestedIds.length);
  const conversions =
    input.amount !== undefined || input.currency !== undefined
      ? await postgresFxRateBook.convertBatch(
          initialRows.map((row) => ({
            amount: input.amount ?? row.amount,
            from: normalizeCurrency(input.currency ?? row.currency),
            to: initialMainCurrency,
            ...(row.entryDate != null && row.entryDate !== "" ? { date: row.entryDate } : {}),
          })),
          initialMainCurrency
        )
      : null;

  return db.transaction(async (tx) => {
    const lockedLedger = await lockLedgerForUpdate(tx, input.ledgerId);
    if (lockedLedger.mainCurrency !== initialMainCurrency) {
      throw new ConflictError("Ledger currency changed before the batch edit");
    }
    const candidates = await tx
      .select({ sourceDocumentId: ledgerEntries.sourceDocumentId })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, requestedIds),
          isNull(ledgerEntries.deletedAt)
        )
      );
    const documentIds = [
      ...new Set(
        candidates.flatMap((row) => (row.sourceDocumentId == null ? [] : [row.sourceDocumentId]))
      ),
    ].sort();
    const lockedDocuments =
      documentIds.length === 0
        ? []
        : await tx
            .select({ id: sourceDocuments.id })
            .from(sourceDocuments)
            .where(
              and(
                eq(sourceDocuments.ledgerId, input.ledgerId),
                inArray(sourceDocuments.id, documentIds),
                isNull(sourceDocuments.deletedAt)
              )
            )
            .for("update");
    if (lockedDocuments.length !== documentIds.length) {
      throw new ConflictError("Selected source documents changed before the batch edit");
    }

    const rows = await tx
      .select({
        id: ledgerEntries.id,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        sourceDocumentId: ledgerEntries.sourceDocumentId,
        sourceDocumentRevisionId: ledgerEntries.sourceDocumentRevisionId,
        activeRevisionId: sourceDocuments.activeRevisionId,
        entryDate: sourceDocuments.entryDate,
      })
      .from(ledgerEntries)
      .innerJoin(
        sourceDocuments,
        and(
          eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
          eq(sourceDocuments.ledgerId, input.ledgerId),
          isNull(sourceDocuments.deletedAt)
        )
      )
      .where(
        and(
          eq(ledgerEntries.ledgerId, input.ledgerId),
          inArray(ledgerEntries.id, requestedIds),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .orderBy(ledgerEntries.id);

    assertBatchRowsAreCurrent(rows, requestedIds.length);
    if (
      rows.some((row, index) => {
        const initial = initialRows[index];
        return (
          initial == null ||
          row.id !== initial.id ||
          row.amount !== initial.amount ||
          row.currency !== initial.currency ||
          row.entryDate !== initial.entryDate ||
          row.sourceDocumentRevisionId !== initial.sourceDocumentRevisionId ||
          row.activeRevisionId !== initial.activeRevisionId
        );
      })
    ) {
      throw new ConflictError("Selected ledger entries changed before the batch edit");
    }

    const now = new Date();
    const changesJson = JSON.stringify(
      rows.map((row, index) => ({
        id: row.id,
        active_revision_id: row.activeRevisionId,
        amount:
          input.amount == null
            ? null
            : roundToCurrency(input.amount, normalizeCurrency(input.currency ?? row.currency)),
        converted_amount:
          conversions == null
            ? null
            : roundToCurrency(conversions[index]!.convertedAmount, initialMainCurrency),
        exchange_rate: conversions == null ? null : round(conversions[index]!.exchangeRate, 12),
      }))
    );
    const result = await tx.execute(sql`
      WITH changes AS (
        SELECT * FROM jsonb_to_recordset(${changesJson}::jsonb) AS value(
          id uuid,
          active_revision_id uuid,
          amount numeric,
          converted_amount numeric,
          exchange_rate numeric
        )
      )
      UPDATE ledger_entries AS entry
      SET
        category_id = CASE WHEN ${input.categoryId !== undefined} THEN ${input.categoryId ?? null}::uuid ELSE entry.category_id END,
        currency = CASE WHEN ${input.currency !== undefined} THEN ${input.currency == null ? null : normalizeCurrency(input.currency)}::varchar ELSE entry.currency END,
        amount = CASE WHEN ${input.amount !== undefined} THEN changes.amount ELSE entry.amount END,
        description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null}::text ELSE entry.description END,
        item_name = CASE WHEN ${input.itemName !== undefined} THEN ${input.itemName ?? null}::text ELSE entry.item_name END,
        converted_amount = CASE WHEN ${conversions != null} THEN changes.converted_amount ELSE entry.converted_amount END,
        exchange_rate = CASE WHEN ${conversions != null} THEN changes.exchange_rate ELSE entry.exchange_rate END,
        updated_at = ${now}
      FROM changes
      WHERE entry.id = changes.id
        AND entry.ledger_id = ${input.ledgerId}
        AND entry.source_document_revision_id = changes.active_revision_id
        AND entry.deleted_at IS NULL
      RETURNING entry.id
    `);
    if (result.rows.length !== rows.length) {
      throw new ConflictError("Ledger entry changed during the batch edit");
    }
    return rows.length;
  });
}

export async function batchDeleteLedgerEntries(
  ledgerId: string,
  ledgerEntryIds: string[]
): Promise<BatchActionResult> {
  const requestedIds = [...new Set(ledgerEntryIds)];
  const result: BatchActionResult = {
    requestedCount: requestedIds.length,
    succeededIds: [],
    skipped: [],
    failed: [],
  };
  if (requestedIds.length === 0) return result;

  // Legacy source documents may not have a canonical active projection yet.
  // Resolve those projections before the active-revision join below, otherwise
  // their entries are silently excluded and reported as unavailable. The
  // per-entry delete path resolves the same projections before deleting.
  const linkedRows = await db
    .select({
      entryId: ledgerEntries.id,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      activeRevisionId: sourceDocuments.activeRevisionId,
    })
    .from(ledgerEntries)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .where(
      and(
        eq(ledgerEntries.ledgerId, ledgerId),
        inArray(ledgerEntries.id, requestedIds),
        isNull(ledgerEntries.deletedAt)
      )
    );

  const entryIdsByDocument = new Map<string, string[]>();
  for (const row of linkedRows) {
    if (row.sourceDocumentId == null) continue;
    const entryIds = entryIdsByDocument.get(row.sourceDocumentId) ?? [];
    entryIds.push(row.entryId);
    entryIdsByDocument.set(row.sourceDocumentId, entryIds);
  }

  const failedIds = new Set<string>();
  for (const sourceDocumentId of [
    ...new Set(
      linkedRows
        .filter((row) => row.activeRevisionId == null)
        .flatMap((row) => (row.sourceDocumentId == null ? [] : [row.sourceDocumentId]))
    ),
  ].sort()) {
    try {
      await ensureTargetLedgerProjection(ledgerId, sourceDocumentId);
    } catch (error) {
      for (const id of entryIdsByDocument.get(sourceDocumentId) ?? []) {
        failedIds.add(id);
        result.failed.push({
          id,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
  }

  const selectedRows = await db
    .select({
      id: ledgerEntries.id,
      sourceDocumentId: ledgerEntries.sourceDocumentId,
      activeRevisionId: sourceDocuments.activeRevisionId,
    })
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
        inArray(ledgerEntries.id, requestedIds),
        isNull(ledgerEntries.deletedAt)
      )
    );
  const selectedById = new Map(selectedRows.map((row) => [row.id, row] as const));
  const groups = new Map<string, { entryIds: string[]; expectedActiveRevisionId: string }>();

  for (const id of requestedIds) {
    if (failedIds.has(id)) continue;
    const row = selectedById.get(id);
    if (row == null || row.sourceDocumentId == null || row.activeRevisionId == null) {
      result.skipped.push({ id, reason: "not_available" });
      continue;
    }
    const group = groups.get(row.sourceDocumentId) ?? {
      entryIds: [],
      expectedActiveRevisionId: row.activeRevisionId,
    };
    group.entryIds.push(id);
    groups.set(row.sourceDocumentId, group);
  }

  for (const [sourceDocumentId, group] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    try {
      const entries = await listActiveProjectionEntries(
        ledgerId,
        sourceDocumentId,
        group.expectedActiveRevisionId
      );
      const selected = new Set(group.entryIds);
      await postgresLedgerProjectionAdapter.replaceActive({
        ledgerId,
        sourceDocumentId,
        expectedActiveRevisionId: group.expectedActiveRevisionId,
        entries: entries.filter((entry) => !selected.has(entry.id)).map(toProjectionEntry),
      });
      result.succeededIds.push(...group.entryIds);
    } catch (error) {
      for (const id of group.entryIds) {
        result.failed.push({
          id,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
  }

  return result;
}

function assertBatchRowsAreCurrent(
  rows: Array<{
    sourceDocumentId: string | null;
    sourceDocumentRevisionId: string | null;
    activeRevisionId: string | null;
  }>,
  expectedCount: number
) {
  if (
    rows.length !== expectedCount ||
    rows.some(
      (row) =>
        row.sourceDocumentId == null ||
        row.activeRevisionId == null ||
        row.sourceDocumentRevisionId !== row.activeRevisionId
    )
  ) {
    throw new ConflictError("Selected ledger entries changed before the batch edit");
  }
}
