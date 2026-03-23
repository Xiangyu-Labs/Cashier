import { listLedgerEntryPage } from "@/modules/ledger/application/queries/list-ledger-entry-page";
import {
  type ListLedgerEntriesInput,
  type ListLedgerEntriesValidatedInput,
  parseListLedgerEntriesInput,
} from "@/modules/ledger/contract-schemas";
import type { LedgerEntryPageDto } from "@/modules/ledger/contracts";

export async function listLedgerEntries(
  ledgerId: string,
  params: ListLedgerEntriesInput
): Promise<LedgerEntryPageDto> {
  const validated = parseListLedgerEntriesInput(params);
  return listLedgerEntriesFromValidatedInput(ledgerId, validated);
}

export async function listLedgerEntriesFromValidatedInput(
  ledgerId: string,
  validated: ListLedgerEntriesValidatedInput
): Promise<LedgerEntryPageDto> {
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
