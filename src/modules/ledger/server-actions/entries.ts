"use server";
import { withLedgerAccess } from "../access";
import type {
  BatchLedgerEntriesMutationResultDto,
  DeleteLedgerEntryResultDto,
  LedgerEntryDto,
} from "@/modules/ledger/contracts";
import {
  batchDeleteLedgerEntries,
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  deleteLedgerEntry,
  updateLedgerEntryWithConversion,
} from "@/modules/ledger/use-cases";
import { listLedgerEntries } from "@/modules/ledger/queries";
import {
  parseBatchUpdateLedgerEntriesInput,
  parseCreateLedgerEntryInput,
  parseLedgerEntryId,
  parseLedgerEntryIds,
  parseUpdateLedgerEntryInput,
  type BatchUpdateLedgerEntriesInput,
  type CreateLedgerEntryInput,
  type UpdateLedgerEntryInput,
} from "@/modules/ledger/contract-schemas";

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateLedgerEntryInput): Promise<LedgerEntryDto> => {
    const validated = parseCreateLedgerEntryInput(data);
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
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    const validated = parseUpdateLedgerEntryInput(data);
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
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    return deleteLedgerEntry(ledgerId, validatedLedgerEntryId);
  }
);

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[]
  ): Promise<BatchLedgerEntriesMutationResultDto> => {
    const validatedLedgerEntryIds = parseLedgerEntryIds(ledgerEntryIds);
    return batchDeleteLedgerEntries(ledgerId, validatedLedgerEntryIds);
  }
);

export const batchUpdateLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: BatchUpdateLedgerEntriesInput
  ): Promise<BatchLedgerEntriesMutationResultDto> => {
    const validatedLedgerEntryIds = parseLedgerEntryIds(ledgerEntryIds);
    const validated = parseBatchUpdateLedgerEntriesInput(data);
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

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
