import { listLedgerEntryPage } from "@/modules/ledger/application/queries/list-ledger-entry-page";
import {
  type ListLedgerEntriesInput,
  type ListLedgerEntriesValidatedInput,
  parseListLedgerEntriesInput,
} from "@/modules/ledger/contract-schemas";
import type { LedgerEntryPageDto } from "@/modules/ledger/contracts";

const UNCATEGORIZED_SENTINEL = "__uncategorized__";

export async function listLedgerEntries(
  ledgerId: string,
  params: ListLedgerEntriesInput
): Promise<LedgerEntryPageDto> {
  const isUncategorizedFilter = params.categoryId === UNCATEGORIZED_SENTINEL;
  const sanitizedParams = isUncategorizedFilter
    ? { ...params, categoryId: undefined }
    : params;

  const validated = parseListLedgerEntriesInput(sanitizedParams);
  return listLedgerEntriesFromValidatedInput(ledgerId, validated, {
    uncategorizedOnly: isUncategorizedFilter,
  });
}

export async function listLedgerEntriesFromValidatedInput(
  ledgerId: string,
  validated: ListLedgerEntriesValidatedInput,
  options?: { uncategorizedOnly?: boolean }
): Promise<LedgerEntryPageDto> {
  const filters: Parameters<typeof listLedgerEntryPage>[0]["filters"] = {};
  if (validated.startDate !== undefined) filters.startDate = validated.startDate;
  if (validated.endDate !== undefined) filters.endDate = validated.endDate;
  if (validated.categoryId !== undefined) filters.categoryId = validated.categoryId;
  if (validated.currency !== undefined) filters.currency = validated.currency;
  if (validated.minAmount !== undefined) filters.minAmount = validated.minAmount;
  if (validated.maxAmount !== undefined) filters.maxAmount = validated.maxAmount;
  if (options?.uncategorizedOnly) {
    filters.uncategorizedOnly = true;
  }

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
