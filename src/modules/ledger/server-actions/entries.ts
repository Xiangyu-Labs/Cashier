"use server";
import { withLedgerAccess } from "../access";
import type { DeleteLedgerEntryResultDto, LedgerEntryDto } from "@/modules/ledger/contracts";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
import { batchDeleteLedgerEntries } from "@/modules/ledger/application/use-cases/batch-delete-ledger-entries";
import { getBatchEntryDateImpact } from "@/modules/ledger/application/queries/get-batch-entry-date-impact";
import { updateLedgerEntryDates } from "@/modules/ledger/application/use-cases/update-ledger-entry-dates";
import { batchUpdateSourceDocuments } from "@/modules/source-document/application/use-cases/update-source-document";
import { deleteLedgerEntry } from "@/modules/ledger/application/use-cases/delete-ledger-entry";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import {
  parseBatchUpdateLedgerEntriesInput,
  parseBatchUpdateLedgerEntryDatesInput,
  parseCreateLedgerEntryInput,
  parseLedgerEntryId,
  parseLedgerEntryIds,
  parseUpdateLedgerEntryInput,
  type BatchUpdateLedgerEntriesInput,
  type CreateLedgerEntryInput,
  type UpdateLedgerEntryInput,
} from "@/modules/ledger/contract-schemas";
import type { BatchActionResult } from "@/lib/batch-ids";
import { serverComposition } from "@/application/server-composition-root";

export const createLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    data: CreateLedgerEntryInput,
    _operationId?: string
  ): Promise<LedgerEntryDto> => {
    const validated = parseCreateLedgerEntryInput(data);
    const payload: Parameters<typeof createLedgerEntryWithConversion>[0] = {
      ledgerId,
      amount: String(validated.amount),
      itemName: validated.itemName,
      sourceDocumentId: validated.sourceDocumentId,
    };
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.description !== undefined) payload.description = validated.description;
    return createLedgerEntryWithConversion(payload, {
      mutations: serverComposition.ledgerMutations,
      categories: serverComposition.categories,
    });
  }
);

export const updateLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    data: UpdateLedgerEntryInput,
    _operationId?: string
  ): Promise<LedgerEntryDto> => {
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    const validated = parseUpdateLedgerEntryInput(data);
    const payload: Parameters<typeof updateLedgerEntryWithConversion>[0] = {
      ledgerId,
      ledgerEntryId: validatedLedgerEntryId,
    };
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.amount !== undefined) payload.amount = String(validated.amount);
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.itemName !== undefined) payload.itemName = validated.itemName;
    if (validated.description !== undefined) payload.description = validated.description;
    return updateLedgerEntryWithConversion(payload, {
      mutations: serverComposition.ledgerMutations,
      categories: serverComposition.categories,
    });
  }
);

export const deleteLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    _operationId?: string
  ): Promise<DeleteLedgerEntryResultDto> => {
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    return deleteLedgerEntry(ledgerId, validatedLedgerEntryId, serverComposition.ledgerMutations);
  }
);

export const batchUpdateLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: BatchUpdateLedgerEntriesInput
  ): Promise<{ ledgerEntryIds: string[]; affectedCount: number }> => {
    const validatedLedgerEntryIds = parseLedgerEntryIds(ledgerEntryIds);
    const validated = parseBatchUpdateLedgerEntriesInput(data);
    const payload: Parameters<typeof batchUpdateLedgerEntries>[0] = {
      ledgerId,
      ledgerEntryIds: validatedLedgerEntryIds,
    };
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.amount !== undefined) payload.amount = String(validated.amount);
    if (validated.description !== undefined) payload.description = validated.description;
    if (validated.itemName !== undefined) payload.itemName = validated.itemName;
    const affectedCount = await batchUpdateLedgerEntries(payload, {
      mutations: serverComposition.ledgerMutations,
      categories: serverComposition.categories,
    });

    return {
      ledgerEntryIds: validatedLedgerEntryIds,
      affectedCount,
    };
  }
);

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (ledgerId: string, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = parseLedgerEntryIds(inputIds);
    return batchDeleteLedgerEntries(
      { ledgerId, ledgerEntryIds: ids },
      serverComposition.ledgerMutations
    );
  }
);
export const previewBatchLedgerEntryDateAction = withLedgerAccess(
  async (ledgerId: string, inputIds: string[]) => {
    const entryIds = parseLedgerEntryIds(inputIds);
    return getBatchEntryDateImpact(
      { ledgerId, ledgerEntryIds: entryIds },
      serverComposition.ledgerReads
    );
  }
);

export const batchUpdateLedgerEntryDatesAction = withLedgerAccess(
  async (ledgerId: string, inputIds: string[], entryDate: string) => {
    const validated = parseBatchUpdateLedgerEntryDatesInput({
      entryIds: inputIds,
      entryDate,
    });
    const impact = await updateLedgerEntryDates(
      {
        ledgerId,
        ledgerEntryIds: validated.entryIds,
        entryDate: validated.entryDate,
      },
      {
        reads: serverComposition.ledgerReads,
      }
    );
    if (impact.sourceDocumentIds.length > 0) {
      await batchUpdateSourceDocuments(
        {
          ledgerId,
          sourceDocumentIds: impact.sourceDocumentIds,
          data: { entryDate: validated.entryDate },
        },
        serverComposition.sourceDocumentUpdates
      );
    }
    return impact;
  }
);

export const getLedgerEntriesAction = withLedgerAccess(
  (ledgerId: string, params: Parameters<typeof listLedgerEntries>[1]) =>
    listLedgerEntries(ledgerId, params, serverComposition.ledgerReads)
);
