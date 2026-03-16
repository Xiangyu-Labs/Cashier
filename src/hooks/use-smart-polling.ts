import { useQuery, UseQueryOptions, QueryKey as _QueryKey } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { useMutationStore } from "@/lib/store/mutation-state";

interface SmartPollingOptions<TData, TError> extends Omit<UseQueryOptions<TData, TError>, 'refetchInterval'> {
    isActive: (data: TData | undefined) => boolean;
    /** Base polling interval in ms (default 3000) */
    interval?: number;
    /** Cooldown interval when no changes detected (default 10000) */
    cooldownInterval?: number;
    /** Interval when idle (no active tasks). Default: false (stop polling). Set to a number like 60000 to enable background checks. */
    idleInterval?: number;
    /** Ledger ID for tenant-scoped mutation pausing */
    ledgerId: string;
    /** Optional key extractor to avoid JSON.stringify on large objects */
    dataKey?: (data: TData | undefined) => string | undefined;
}

/**
 * A wrapper around useQuery that implements smart polling with adaptive intervals.
 *
 * - Active period: Polls at base `interval` (5s) when isActive returns true
 * - Cooldown period: If data hasn't changed in 2+ polls, slows to `cooldownInterval` (10s)
 * - Pauses polling when there are active mutations for the specified ledger
 */
export function useSmartPolling<TData = unknown, TError = unknown>(
    options: SmartPollingOptions<TData, TError>
) {
    const { isActive, interval = 5000, cooldownInterval = 10000, idleInterval, ledgerId, dataKey, ...queryOptions } = options;

    const hasActiveLedgerMutation = useMutationStore((state) => state.hasActiveLedgerMutation);

    // Track consecutive unchanged polls
    const unchangedCountRef = useRef(0);
    const lastDataRef = useRef<string | undefined>(undefined);

    const checkDataChanged = useCallback((data: TData | undefined) => {
        const dataStr = dataKey
            ? dataKey(data)
            : JSON.stringify(data);
        const changed = dataStr !== lastDataRef.current;
        lastDataRef.current = dataStr;

        if (changed) {
            unchangedCountRef.current = 0;
        } else {
            unchangedCountRef.current++;
        }

        return changed;
    }, [dataKey]);

    return useQuery<TData, TError>({
        ...queryOptions,
        refetchInterval: (query) => {
            // PAUSE polling when this ledger has active mutations
            // This prevents polling from overwriting optimistic updates
            if (hasActiveLedgerMutation(ledgerId)) {
                return false;
            }

            const data = query.state.data;

            if (!isActive(data)) {
                // Reset counters when not active
                unchangedCountRef.current = 0;
                return idleInterval ?? false;
            }

            checkDataChanged(data);

            // Use cooldown interval if data unchanged for 2+ polls
            if (unchangedCountRef.current >= 2) {
                return cooldownInterval;
            }

            return interval;
        },
    });
}
