"use server";
import { withLedgerAccess } from "../access";
import type { DeleteLedgerEntryResultDto, LedgerEntryDto } from "@/modules/ledger/contracts";
import {
  batchUpdateLedgerEntries,
  createLedgerEntryWithConversion,
  updateLedgerEntryWithConversion,
} from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
import { deleteLedgerEntry } from "@/modules/ledger/application/use-cases/delete-ledger-entry";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
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
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import {
  buildEntityReconciliation,
  readSourceDocumentListItem,
} from "@/modules/source-document/server-actions/reconciliation";
import type { MutationReconciliation } from "@/modules/source-document/contracts";

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateLedgerEntryInput): Promise<LedgerEntryDto> => {
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
    return createLedgerEntryWithConversion(payload);
  }
);

export const updateLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    data: UpdateLedgerEntryInput,
    operationId?: string
  ): Promise<
    LedgerEntryDto & Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>
  > => {
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
    const result = await updateLedgerEntryWithConversion(payload);

    if (operationId != null && result.sourceDocumentId != null) {
      // C3: Read authoritative source document from DB instead of fabricating
      const authoritativeEntity = await readSourceDocumentListItem(
        ledgerId,
        result.sourceDocumentId
      );
      const now = authoritativeEntity?.updatedAt ?? result.updatedAt;
      const entity = buildEntityReconciliation(operationId, authoritativeEntity, now, true, true);
      return { ...result, reconciliation: entity };
    }

    return result;
  }
);

export const deleteLedgerEntryAction = withLedgerAccess(
  async (
    ledgerId: string,
    ledgerEntryId: string,
    operationId?: string
  ): Promise<
    DeleteLedgerEntryResultDto &
      Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>
  > => {
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    const result = await deleteLedgerEntry(ledgerId, validatedLedgerEntryId);

    if (operationId != null && result.deleted) {
      // C3: Read authoritative source document from DB if available
      let canonicalEntity: SourceDocumentListItemDto | null = null;
      if (result.sourceDocumentId != null) {
        canonicalEntity = await readSourceDocumentListItem(ledgerId, result.sourceDocumentId);
      }
      const now = canonicalEntity?.updatedAt ?? new Date().toISOString();
      const entity = buildEntityReconciliation(operationId, canonicalEntity, now, true, true);
      return { ...result, reconciliation: entity };
    }

    return result;
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
    const affectedCount = await batchUpdateLedgerEntries(payload);

    return {
      ledgerEntryIds: validatedLedgerEntryIds,
      affectedCount,
    };
  }
);

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
