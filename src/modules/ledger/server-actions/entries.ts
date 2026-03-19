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
    return createLedgerEntryWithConversion({
      ledgerId,
      amount: validated.amount,
      currency: validated.currency,
      itemName: validated.itemName,
      categoryId: validated.categoryId,
      description: validated.description,
      sourceDocumentId: validated.sourceDocumentId,
    });
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
    return updateLedgerEntryWithConversion({
      ledgerId,
      ledgerEntryId: validatedLedgerEntryId,
      categoryId: validated.categoryId,
      amount: validated.amount,
      currency: validated.currency,
      itemName: validated.itemName,
      description: validated.description,
    });
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
    const affectedCount = await batchUpdateLedgerEntries({
      ledgerId,
      ledgerEntryIds: validatedLedgerEntryIds,
      categoryId: validated.categoryId,
      currency: validated.currency,
      amount: validated.amount,
      description: validated.description,
      itemName: validated.itemName,
    });

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
  const result = await listLedgerEntryPage({
    ledgerId,
    limit: validated.limit,
    cursor: validated.cursor ?? null,
    filters: {
      startDate: validated.startDate ?? null,
      endDate: validated.endDate ?? null,
      categoryId: validated.categoryId ?? null,
      currency: validated.currency ?? null,
      minAmount: validated.minAmount ?? null,
      maxAmount: validated.maxAmount ?? null,
    },
  });

  return {
    ...result,
    nextCursor: result.nextCursor ?? null,
  };
}

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
