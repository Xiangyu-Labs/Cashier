import { useQuery, UseQueryOptions, QueryKey as _QueryKey } from "@tanstack/react-query";
import { useRef, useCallback } from "react";

interface SmartPollingOptions<TData, TError> extends Omit<UseQueryOptions<TData, TError>, 'refetchInterval'> {
    isActive: (data: TData | undefined) => boolean;
    /** Base polling interval in ms (default 3000) */
    interval?: number;
    /** Cooldown interval when no changes detected (default 10000) */
    cooldownInterval?: number;
}

/**
 * A wrapper around useQuery that implements smart polling with adaptive intervals.
 * 
 * - Active period: Polls at base `interval` (3s) when isActive returns true
 * - Cooldown period: If data hasn't changed in 2+ polls, slows to `cooldownInterval` (10s)
 */
export function useSmartPolling<TData = unknown, TError = unknown>(
    options: SmartPollingOptions<TData, TError>
) {
    const { isActive, interval = 3000, cooldownInterval = 10000, ...queryOptions } = options;

    // Track consecutive unchanged polls
    const unchangedCountRef = useRef(0);
    const lastDataRef = useRef<string | undefined>(undefined);

    const checkDataChanged = useCallback((data: TData | undefined) => {
        const dataStr = JSON.stringify(data);
        const changed = dataStr !== lastDataRef.current;
        lastDataRef.current = dataStr;

        if (changed) {
            unchangedCountRef.current = 0;
        } else {
            unchangedCountRef.current++;
        }

        return changed;
    }, []);

    return useQuery<TData, TError>({
        ...queryOptions,
        refetchInterval: (query) => {
            const data = query.state.data;

            if (!isActive(data)) {
                // Reset counters when not active
                unchangedCountRef.current = 0;
                return false;
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
