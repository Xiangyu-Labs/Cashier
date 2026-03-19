"use server";

import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import { inArray, and } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";
import type {
  BatchLedgerEntriesMutationResultDto,
  DeleteLedgerEntryResultDto,
  LedgerEntryDto,
  LedgerEntryPageDto,
} from "@/modules/ledger/contracts";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
import { listLedgerEntryPage } from "@/modules/ledger/application/queries/list-ledger-entry-page";
import {
  batchUpdateLedgerEntriesInputSchema,
  createLedgerEntryInputSchema,
  ledgerEntryIdSchema,
  ledgerEntryIdsSchema,
  listLedgerEntriesInputSchema,
  updateLedgerEntryInputSchema,
  type BatchUpdateLedgerEntriesInput,
  type CreateLedgerEntryInput,
  type ListLedgerEntriesInput,
  type UpdateLedgerEntryInput,
} from "@/modules/ledger/contract-schemas";

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateLedgerEntryInput): Promise<LedgerEntryDto> => {
    const validated = createLedgerEntryInputSchema.parse(data);
    const payload: Parameters<typeof createLedgerEntryWithConversion>[0] = {
      ledgerId,
      amount: validated.amount,
      itemName: validated.itemName,
      sourceDocumentId: validated.sourceDocumentId,
    };
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.description !== undefined) payload.description = validated.description;
    return createLedgerEntryWithConversion(payload);
  }
);

export const updateLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    data: UpdateLedgerEntryInput
  ): Promise<LedgerEntryDto> => {
    const validatedLedgerEntryId = ledgerEntryIdSchema.parse(ledgerEntryId);
    const validated = updateLedgerEntryInputSchema.parse(data);
    const payload: Parameters<typeof updateLedgerEntryWithConversion>[0] = {
      ledgerId,
      ledgerEntryId: validatedLedgerEntryId,
    };
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.amount !== undefined) payload.amount = validated.amount;
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.itemName !== undefined) payload.itemName = validated.itemName;
    if (validated.description !== undefined) payload.description = validated.description;
    return updateLedgerEntryWithConversion(payload);
  }
);

export const deleteLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, ledgerEntryId: string): Promise<DeleteLedgerEntryResultDto> => {
    const validatedLedgerEntryId = ledgerEntryIdSchema.parse(ledgerEntryId);
    const q = forLedger(ledgerEntries, ledgerId);
    const deletedEntries = await db
      .update(ledgerEntries)
      .set(q.softDelete)
      .where(q.whereId(validatedLedgerEntryId))
      .returning({ id: ledgerEntries.id });

    return {
      ledgerEntryId: validatedLedgerEntryId,
      deleted: deletedEntries.length > 0,
    };
  }
);

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[]
  ): Promise<BatchLedgerEntriesMutationResultDto> => {
    const validatedLedgerEntryIds = ledgerEntryIdsSchema.parse(ledgerEntryIds);
    const q = forLedger(ledgerEntries, ledgerId);

    const deletedEntries = await db
      .update(ledgerEntries)
      .set(q.softDelete)
      .where(and(q.whereActive, inArray(ledgerEntries.id, validatedLedgerEntryIds)))
      .returning({ id: ledgerEntries.id });

    return {
      ledgerEntryIds: validatedLedgerEntryIds,
      affectedCount: deletedEntries.length,
    };
  }
);

export const batchUpdateLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: BatchUpdateLedgerEntriesInput
  ): Promise<BatchLedgerEntriesMutationResultDto> => {
    const validatedLedgerEntryIds = ledgerEntryIdsSchema.parse(ledgerEntryIds);
    const validated = batchUpdateLedgerEntriesInputSchema.parse(data);
    const payload: Parameters<typeof batchUpdateLedgerEntries>[0] = {
      ledgerId,
      ledgerEntryIds: validatedLedgerEntryIds,
    };
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.amount !== undefined) payload.amount = validated.amount;
    if (validated.description !== undefined) payload.description = validated.description;
    if (validated.itemName !== undefined) payload.itemName = validated.itemName;
    const affectedCount = await batchUpdateLedgerEntries(payload);

    return {
      ledgerEntryIds: validatedLedgerEntryIds,
      affectedCount,
    };
  }
);

export async function listLedgerEntries(
  ledgerId: string,
  params: ListLedgerEntriesInput
): Promise<LedgerEntryPageDto> {
  const validated = listLedgerEntriesInputSchema.parse(params);
  const filters: Parameters<typeof listLedgerEntryPage>[0]["filters"] = {};
  if (validated.startDate !== undefined) filters.startDate = validated.startDate;
  if (validated.endDate !== undefined) filters.endDate = validated.endDate;
  if (validated.categoryId !== undefined) filters.categoryId = validated.categoryId;
  if (validated.currency !== undefined) filters.currency = validated.currency;
  if (validated.minAmount !== undefined) filters.minAmount = validated.minAmount;
  if (validated.maxAmount !== undefined) filters.maxAmount = validated.maxAmount;

  const result = await listLedgerEntryPage({
    ledgerId,
    limit: validated.limit,
    cursor: validated.cursor ?? null,
    filters,
  });

  return {
    ...result,
    nextCursor: result.nextCursor ?? null,
  };
}

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
