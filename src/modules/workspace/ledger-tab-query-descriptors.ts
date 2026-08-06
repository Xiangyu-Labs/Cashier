import type { ListLedgerEntriesInput } from "@/modules/ledger/contract-schemas";
import {
  buildDetailsFilterKey,
  getDetailsInitialQueryState,
  type LedgerAdvancedFilters,
} from "@/modules/ledger/ledger-query";
import {
  canonicalizeSourceDocumentStatuses,
  type SourceDocumentStatusType,
} from "@/modules/source-document/types";
import type { GetStreamTotalInput } from "@/modules/source-document/application/queries/get-stream-total";
import type { ListStreamPageInput } from "@/modules/source-document/application/queries/list-stream-page";
import type { GetEnhancedStatsInput } from "@/modules/stats/contract-schemas";
import { normalizeSearchTerm } from "@/lib/search";
import { queryKeys } from "@/lib/query-keys";
import type { PeriodParams } from "@/lib/period-utils";
import type { DateRangeType } from "@/lib/date-utils";
import {
  DEFAULT_STATS_RANGE_TYPE,
  getStatsInitialQueryState,
  type StatsInitialQueryState,
} from "./initial-query-state";

const STREAM_PAGE_LIMIT = 20;
const DETAILS_PAGE_LIMIT = 50;

function normalizeAdvancedFilters(filters: LedgerAdvancedFilters = {}): LedgerAdvancedFilters {
  const search = normalizeSearchTerm(filters.search);
  return {
    ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
    ...(filters.currency !== undefined ? { currency: filters.currency } : {}),
    ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.statuses !== undefined ? { statuses: filters.statuses } : {}),
    ...(search !== undefined ? { search } : {}),
  };
}

export interface StreamQueryDescriptor {
  queryKey: readonly unknown[];
  totalQueryKey: readonly unknown[];
  getPageInput: (pageParam?: string) => ListStreamPageInput;
  totalInput: GetStreamTotalInput;
}

export function buildStreamQueryDescriptor(input: {
  ledgerId: string;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  minAmount?: number | null | undefined;
  maxAmount?: number | null | undefined;
  statuses?: readonly SourceDocumentStatusType[] | null | undefined;
  search?: string | null | undefined;
}): StreamQueryDescriptor {
  const canonicalStatuses = canonicalizeSourceDocumentStatuses(
    input.statuses == null ? undefined : [...input.statuses]
  );
  const statusesKey = canonicalStatuses?.join(",") ?? null;
  const search = normalizeSearchTerm(input.search) ?? null;
  const baseInput = {
    ...(input.startDate != null && input.startDate !== "" ? { startDate: input.startDate } : {}),
    ...(input.endDate != null && input.endDate !== "" ? { endDate: input.endDate } : {}),
    ...(input.minAmount != null ? { minAmount: input.minAmount } : {}),
    ...(input.maxAmount != null ? { maxAmount: input.maxAmount } : {}),
    ...(canonicalStatuses != null ? { statuses: canonicalStatuses } : {}),
    ...(search != null ? { search } : {}),
  };
  const keyFilters = {
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    statuses: statusesKey,
    search,
  };

  return {
    queryKey: queryKeys.sourceDocumentStream(input.ledgerId, keyFilters),
    totalQueryKey: queryKeys.sourceDocumentStreamTotal(input.ledgerId, keyFilters),
    getPageInput: (pageParam) => ({
      ...baseInput,
      ...(pageParam != null ? { cursor: pageParam } : {}),
      limit: STREAM_PAGE_LIMIT,
    }),
    totalInput: baseInput,
  };
}

export interface DetailsQueryDescriptor {
  startDateStr: string | null;
  endDateStr: string | null;
  filterKey: string | null;
  summaryQueryKey: readonly unknown[];
  entriesQueryKey: readonly unknown[];
  summaryParams: {
    startDate?: string;
    endDate?: string;
    mainCurrency: string;
    filters: {
      categoryId?: string | null;
      currency?: string | null;
      minAmount?: number | null;
      maxAmount?: number | null;
      search?: string | null;
    };
  };
  getEntriesInput: (pageParam?: string) => ListLedgerEntriesInput;
}

export function buildDetailsQueryDescriptor(input: {
  ledgerId: string;
  periodParams: PeriodParams;
  advancedFilters?: LedgerAdvancedFilters | undefined;
  timeZone?: string | undefined;
  mainCurrency: string;
}): DetailsQueryDescriptor {
  const filters = normalizeAdvancedFilters(input.advancedFilters);
  const state = getDetailsInitialQueryState(input.periodParams, filters, input.timeZone);
  const filterKey = buildDetailsFilterKey(filters);
  const detailsFilters = {
    ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
    ...(filters.currency !== undefined ? { currency: filters.currency } : {}),
    ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.search !== undefined ? { search: filters.search } : {}),
  };

  return {
    startDateStr: state.startDateStr,
    endDateStr: state.endDateStr,
    filterKey,
    summaryQueryKey: queryKeys.summary(
      input.ledgerId,
      state.startDateStr,
      state.endDateStr,
      input.mainCurrency,
      filterKey
    ),
    entriesQueryKey: queryKeys.ledgerEntries(
      input.ledgerId,
      "infinite",
      state.startDateStr,
      state.endDateStr,
      filterKey
    ),
    summaryParams: {
      ...(state.startDateStr != null ? { startDate: state.startDateStr } : {}),
      ...(state.endDateStr != null ? { endDate: state.endDateStr } : {}),
      mainCurrency: input.mainCurrency,
      filters: detailsFilters,
    },
    getEntriesInput: (pageParam) => ({
      ...(state.startDateStr != null ? { startDate: state.startDateStr } : {}),
      ...(state.endDateStr != null ? { endDate: state.endDateStr } : {}),
      ...(filters.categoryId != null ? { categoryId: filters.categoryId } : {}),
      ...(filters.currency != null ? { currency: filters.currency } : {}),
      ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
      ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
      ...(filters.search != null ? { search: filters.search } : {}),
      ...(pageParam != null ? { cursor: pageParam } : {}),
      limit: DETAILS_PAGE_LIMIT,
    }),
  };
}

export interface StatsQueryDescriptor {
  state: StatsInitialQueryState;
  queryKey: readonly unknown[];
  input: GetEnhancedStatsInput;
}

export function buildStatsQueryDescriptor(input: {
  ledgerId: string;
  currentDate: Date;
  mainCurrency: string;
  rangeType?: DateRangeType | undefined;
  currentPeriod?: boolean | undefined;
}): StatsQueryDescriptor {
  const statsOptions =
    input.currentPeriod === undefined ? {} : { currentPeriod: input.currentPeriod };
  const state = getStatsInitialQueryState(
    input.currentDate,
    input.rangeType ?? DEFAULT_STATS_RANGE_TYPE,
    statsOptions
  );

  return {
    state,
    queryKey: queryKeys.enhancedStats(input.ledgerId, {
      startDate: state.startDateStr,
      endDate: state.endDateStr,
      compareStartDate: state.prevDateStartStr,
      compareEndDate: state.prevDateEndStr,
      rangeType: state.rangeType,
      comparisonMode: state.mode,
      mainCurrency: input.mainCurrency,
    }),
    input: {
      ledgerId: input.ledgerId,
      queryRange: {
        from: state.startDateStr,
        to: state.endDateStr,
      },
      compareRange: {
        from: state.prevDateStartStr,
        to: state.prevDateEndStr,
      },
      comparisonMode: state.mode,
    },
  };
}
