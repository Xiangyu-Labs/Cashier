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
import type { BatchActionResult } from "@/lib/batch-ids";
import { db } from "@/lib/db";
import { entryCategories, ledgerEntries, sourceDocuments } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { batchUpdateSourceDocuments } from "@/modules/source-document/application/use-cases/update-source-document";
import { NotFoundError } from "@/lib/errors";

async function assertCategoryBelongsToLedger(ledgerId: string, categoryId: string | null | undefined) {
  if (categoryId == null) return;
  const category = await db.query.entryCategories.findFirst({
    where: and(eq(entryCategories.id, categoryId), eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
    columns: { id: true },
  });
  if (category == null) throw new NotFoundError("Category");
}

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateLedgerEntryInput): Promise<LedgerEntryDto> => {
    const validated = parseCreateLedgerEntryInput(data);
    await assertCategoryBelongsToLedger(ledgerId, validated.categoryId);
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
    await assertCategoryBelongsToLedger(ledgerId, validated.categoryId);
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
    await assertCategoryBelongsToLedger(ledgerId, validated.categoryId);
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

export const batchDeleteLedgerEntriesAction = withLedgerAccess(
  async (ledgerId: string, inputIds: string[]): Promise<BatchActionResult> => {
    const ids = parseLedgerEntryIds(inputIds);
    const result: BatchActionResult = { requestedCount: ids.length, succeededIds: [], skipped: [], failed: [] };
    for (const id of ids) {
      try {
        const deleted = await deleteLedgerEntry(ledgerId, id);
        if (deleted.deleted) result.succeededIds.push(id);
        else result.skipped.push({ id, reason: "not_available" });
      } catch (error) {
        result.failed.push({ id, reason: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return result;
  }
);

export interface BatchEntryDateImpact {
  selectedEntryCount: number;
  sourceDocumentCount: number;
  affectedEntryCount: number;
  sourceDocumentIds: string[];
}

async function getBatchEntryDateImpact(ledgerId: string, inputIds: string[]): Promise<BatchEntryDateImpact> {
  const ids = parseLedgerEntryIds(inputIds);
  const selected = await db
    .select({ id: ledgerEntries.id, sourceDocumentId: ledgerEntries.sourceDocumentId })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, and(
      eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
      eq(sourceDocuments.ledgerId, ledgerId),
      isNull(sourceDocuments.deletedAt)
    ))
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), inArray(ledgerEntries.id, ids), isNull(ledgerEntries.deletedAt)));
  const sourceDocumentIds = [...new Set(selected.flatMap((row) => row.sourceDocumentId == null ? [] : [row.sourceDocumentId]))];
  if (sourceDocumentIds.length === 0) {
    return { selectedEntryCount: selected.length, sourceDocumentCount: 0, affectedEntryCount: 0, sourceDocumentIds: [] };
  }
  const affected = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, and(
      eq(sourceDocuments.id, ledgerEntries.sourceDocumentId),
      eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
      isNull(sourceDocuments.deletedAt)
    ))
    .where(and(eq(ledgerEntries.ledgerId, ledgerId), inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds), isNull(ledgerEntries.deletedAt)));
  return {
    selectedEntryCount: selected.length,
    sourceDocumentCount: sourceDocumentIds.length,
    affectedEntryCount: affected.length,
    sourceDocumentIds,
  };
}

export const previewBatchLedgerEntryDateAction = withLedgerAccess(getBatchEntryDateImpact);

export const batchUpdateLedgerEntryDatesAction = withLedgerAccess(
  async (ledgerId: string, inputIds: string[], entryDate: string) => {
    const impact = await getBatchEntryDateImpact(ledgerId, inputIds);
    if (impact.sourceDocumentIds.length > 0) {
      await batchUpdateSourceDocuments({ ledgerId, sourceDocumentIds: impact.sourceDocumentIds, data: { entryDate } });
    }
    return impact;
  }
);

export const getLedgerEntriesAction = withLedgerAccess(listLedgerEntries);
