import { listLedgerEntryPage } from "@/modules/ledger/application/queries/list-ledger-entry-page";
import {
  type ListLedgerEntriesInput,
  type ListLedgerEntriesValidatedInput,
  parseListLedgerEntriesInput,
} from "@/modules/ledger/contract-schemas";
import type { LedgerEntryPageDto } from "@/modules/ledger/contracts";

// "__uncategorized__" is a UI/query sentinel for `categoryId = null`.
// It must be normalized at query boundaries and must never be persisted as a real category id.
export const UNCATEGORIZED_SENTINEL = "__uncategorized__";

export async function listLedgerEntries(
  ledgerId: string,
  params: ListLedgerEntriesInput
): Promise<LedgerEntryPageDto> {
  const paramsRecord =
    typeof params === "object" && params !== null ? (params as Record<string, unknown>) : null;
  const categoryIdCandidate = paramsRecord?.categoryId;
  const isUncategorizedFilter = categoryIdCandidate === UNCATEGORIZED_SENTINEL;
  const sanitizedParams =
    isUncategorizedFilter && paramsRecord
      ? ({
          ...paramsRecord,
          categoryId: undefined,
        } as ListLedgerEntriesInput)
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
  if (validated.search !== undefined) filters.searchQuery = validated.search;
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
