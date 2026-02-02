import { useQuery, UseQueryOptions, QueryKey as _QueryKey } from "@tanstack/react-query";

interface SmartPollingOptions<TData, TError> extends Omit<UseQueryOptions<TData, TError>, 'refetchInterval'> {
    isActive: (data: TData | undefined) => boolean;
    interval?: number;
}

/**
 * A wrapper around useQuery that implements smart polling.
 * It polls the data at a specified interval ONLY when the isActive check returns true.
 */
export function useSmartPolling<TData = unknown, TError = unknown>(
    options: SmartPollingOptions<TData, TError>
) {
    const { isActive, interval = 3000, ...queryOptions } = options;

    return useQuery<TData, TError>({
        ...queryOptions,
        refetchInterval: (query) => {
            if (isActive(query.state.data)) {
                return interval;
            }
            return false;
        },
    });
}
