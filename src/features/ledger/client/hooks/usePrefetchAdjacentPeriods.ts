import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getAllSourceDocumentsAction } from '@/features/source-document/server/actions/main';
import { type PeriodParams, periodToDateRange } from '@/lib/period-utils';

/**
 * Prefetches adjacent time periods in the background.
 * Improves perceived performance when user switches periods.
 */
export function usePrefetchAdjacentPeriods(
  ledgerId: string,
  currentPeriod: PeriodParams
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Wait 2 seconds before prefetching (user likely to switch)
    const timer = setTimeout(() => {
      const periodsToPreload = getAdjacentPeriods(currentPeriod);

      periodsToPreload.forEach(period => {
        const dateRange = periodToDateRange(period);

        queryClient.prefetchQuery({
          queryKey: queryKeys.sourceDocuments(
            ledgerId,
            'all',
            dateRange.startDate,
            dateRange.endDate
          ),
          queryFn: () =>
            getAllSourceDocumentsAction(ledgerId, {
              startDate: dateRange.startDate ?? undefined,
              endDate: dateRange.endDate ?? undefined,
            }),
          staleTime: 10 * 60 * 1000, // 10 minutes
        });
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [ledgerId, currentPeriod, queryClient]);
}

function getAdjacentPeriods(current: PeriodParams): PeriodParams[] {
  const periods: PeriodParams[] = [];

  // If viewing "currentPeriod", prefetch "week" and "thisMonth"
  if (current.period === 'currentPeriod') {
    periods.push({ period: 'week' });
    periods.push({ period: 'thisMonth' });
  }
  // If viewing "thisMonth", prefetch "currentPeriod" and "week"
  else if (current.period === 'thisMonth') {
    periods.push({ period: 'currentPeriod', monthStartDay: current.monthStartDay });
    periods.push({ period: 'week' });
  }
  // If viewing "all", prefetch "currentPeriod"
  else if (current.period === 'all') {
    periods.push({ period: 'currentPeriod', monthStartDay: current.monthStartDay });
  }
  // If viewing "week", prefetch "currentPeriod"
  else if (current.period === 'week') {
    periods.push({ period: 'currentPeriod', monthStartDay: current.monthStartDay });
  }
  // If viewing custom date range, prefetch "currentPeriod" and "thisMonth"
  else if (current.startDate || current.endDate) {
    periods.push({ period: 'currentPeriod', monthStartDay: current.monthStartDay });
    periods.push({ period: 'thisMonth' });
  }

  return periods;
}
