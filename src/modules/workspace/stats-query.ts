import { queryKeys } from "@/lib/query-keys";
import type { GetEnhancedStatsInput } from "@/modules/stats/contract-schemas";
import type { StatsInitialQueryState } from "./initial-query-state";

export interface StatsQueryDescriptor {
  input: GetEnhancedStatsInput;
  queryKey: ReturnType<typeof queryKeys.enhancedStats>;
}

/**
 * Single source of truth for the enhanced-stats query input and its React
 * Query key. SSR prefetch, client prefetch, and the active stats tab must all
 * use this descriptor so hydrated cache entries are reused instead of being
 * re-fetched under a diverging key.
 */
export function buildStatsQueryDescriptor({
  ledgerId,
  state,
  mainCurrency,
}: {
  ledgerId: string;
  state: StatsInitialQueryState;
  mainCurrency: string;
}): StatsQueryDescriptor {
  return {
    input: {
      ledgerId,
      queryRange: { from: state.startDateStr, to: state.endDateStr },
      compareRange: { from: state.prevDateStartStr, to: state.prevDateEndStr },
      comparisonMode: state.mode,
    },
    queryKey: queryKeys.enhancedStats(ledgerId, {
      startDate: state.startDateStr,
      endDate: state.endDateStr,
      compareStartDate: state.prevDateStartStr,
      compareEndDate: state.prevDateEndStr,
      rangeType: state.rangeType,
      comparisonMode: state.mode,
      mainCurrency,
    }),
  };
}
