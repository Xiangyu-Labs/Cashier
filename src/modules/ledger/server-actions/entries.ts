"use server";
import { withLedgerAccess, withLedgerAccessContext } from "../access";
import { createHash } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { isValidUuid } from "@/lib/validation";
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value != null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function deterministicEntryId(ledgerId: string, operationId: string): string {
  const bytes = createHash("sha256").update(`${ledgerId}:${operationId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function requireOperationId(operationId: string): string {
  if (!isValidUuid(operationId)) throw new ValidationError("operationId must be a UUID");
  return operationId;
}

export const createLedgerEntryAction = withLedgerAccessContext(
  async (
    { userId },
    ledgerId: string,
    data: CreateLedgerEntryInput,
    operationId: string
  ): Promise<LedgerEntryDto> => {
    const validatedOperationId = requireOperationId(operationId);
    const validated = parseCreateLedgerEntryInput(data);
    const payload: Parameters<typeof createLedgerEntryWithConversion>[0] = {
      ledgerId,
      ledgerEntryId: deterministicEntryId(ledgerId, validatedOperationId),
      amount: String(validated.amount),
      itemName: validated.itemName,
      sourceDocumentId: validated.sourceDocumentId,
    };
    if (validated.currency !== undefined) payload.currency = validated.currency;
    if (validated.categoryId !== undefined) payload.categoryId = validated.categoryId;
    if (validated.description !== undefined) payload.description = validated.description;
    return serverComposition.ledgerEntryIdempotency.run(
      {
        userId,
        ledgerId,
        operationId: validatedOperationId,
        fingerprint: fingerprint({
          operation: "create",
          ledgerId,
          entryId: null,
          payload: validated,
        }),
      },
      () =>
        createLedgerEntryWithConversion(payload, {
          mutations: serverComposition.ledgerMutations,
          categories: serverComposition.categories,
        })
    );
  }
);

export const updateLedgerEntryAction = withLedgerAccessContext(
  async (
    { userId },
    ledgerId: string,
    ledgerEntryId: string,
    data: UpdateLedgerEntryInput,
    operationId: string
  ): Promise<LedgerEntryDto> => {
    const validatedOperationId = requireOperationId(operationId);
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
    return serverComposition.ledgerEntryIdempotency.run(
      {
        userId,
        ledgerId,
        operationId: validatedOperationId,
        fingerprint: fingerprint({
          operation: "update",
          ledgerId,
          entryId: validatedLedgerEntryId,
          payload: validated,
        }),
      },
      () =>
        updateLedgerEntryWithConversion(payload, {
          mutations: serverComposition.ledgerMutations,
          categories: serverComposition.categories,
        })
    );
  }
);

export const deleteLedgerEntryAction = withLedgerAccessContext(
  async (
    { userId },
    ledgerId: string,
    ledgerEntryId: string,
    operationId: string
  ): Promise<DeleteLedgerEntryResultDto> => {
    const validatedOperationId = requireOperationId(operationId);
    const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
    return serverComposition.ledgerEntryIdempotency.run(
      {
        userId,
        ledgerId,
        operationId: validatedOperationId,
        fingerprint: fingerprint({
          operation: "delete",
          ledgerId,
          entryId: validatedLedgerEntryId,
          payload: null,
        }),
      },
      () => deleteLedgerEntry(ledgerId, validatedLedgerEntryId, serverComposition.ledgerMutations)
    );
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
