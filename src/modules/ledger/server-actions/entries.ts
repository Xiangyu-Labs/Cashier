"use server";

import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import { z } from "zod";
import { inArray, and } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
import { listLedgerEntryPage } from "@/modules/ledger/application/queries/list-ledger-entry-page";

const createLedgerEntrySchema = z.object({
  amount: z.number(),
  currency: z.string().optional(),
  itemName: z.string().min(1),
  categoryId: z.string().optional(),
  description: z.string().optional().nullable(),
  sourceDocumentId: z.string(),
});

const updateLedgerEntrySchema = z.object({
  categoryId: z.string().nullable().optional(),
  amount: z.number().optional(),
  currency: z.string().nullable().optional(),
  itemName: z.string().optional(),
  description: z.string().nullable().optional(),
});

// Schema for batch update validation
const batchUpdateLedgerEntriesSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    currency: z.string().length(3).nullable().optional(), // ISO 4217 currency code
    amount: z.number().positive().optional(),
    description: z.string().max(500).nullable().optional(),
    itemName: z.string().min(1).max(200).optional(),
  })
  .strict(); // Reject unknown keys

import type { LedgerEntry } from "@/persistence";

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: z.infer<typeof createLedgerEntrySchema>): Promise<LedgerEntry> => {
    const validated = createLedgerEntrySchema.parse(data);
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
    data: z.infer<typeof updateLedgerEntrySchema>
  ): Promise<LedgerEntryDto> => {
    const validated = updateLedgerEntrySchema.parse(data);
    return updateLedgerEntryWithConversion({
      ledgerId,
      ledgerEntryId,
      categoryId: validated.categoryId,
      amount: validated.amount,
      currency: validated.currency,
      itemName: validated.itemName,
      description: validated.description,
    });
  }
);

export const deleteLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, ledgerEntryId: string): Promise<void> => {
    const q = forLedger(ledgerEntries, ledgerId);
    await db.update(ledgerEntries).set(q.softDelete).where(q.whereId(ledgerEntryId));
  }
);

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (ledgerId: string, ledgerEntryIds: string[]): Promise<void> => {
    const q = forLedger(ledgerEntries, ledgerId);

    await db
      .update(ledgerEntries)
      .set(q.softDelete)
      .where(and(q.whereActive, inArray(ledgerEntries.id, ledgerEntryIds)));
  }
);

export const batchUpdateLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: z.infer<typeof batchUpdateLedgerEntriesSchema>
  ): Promise<void> => {
    const validated = batchUpdateLedgerEntriesSchema.parse(data);
    return batchUpdateLedgerEntries({
      ledgerId,
      ledgerEntryIds,
      categoryId: validated.categoryId,
      currency: validated.currency,
      amount: validated.amount,
      description: validated.description,
      itemName: validated.itemName,
    });
  }
);

export async function listLedgerEntries(
  ledgerId: string,
  params: {
    limit?: number;
    cursor?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  }
) {
  return listLedgerEntryPage({
    ledgerId,
    limit: params.limit ?? 20,
    cursor: params.cursor,
    filters: {
      startDate: params.startDate,
      endDate: params.endDate,
      categoryId: params.categoryId,
      currency: params.currency,
      minAmount: params.minAmount,
      maxAmount: params.maxAmount,
    },
  });
}

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
