import { useCallback, useRef } from "react";

interface UseSmartPollingOptions<TData> {
  isPollingActive: (data: TData | undefined) => boolean;
  sessionKey: number;
  intervalsMs?: readonly number[];
}

const DEFAULT_INTERVALS_MS = [3000, 30_000, 60_000, 60_000, 60_000] as const;

export function useSmartPolling<TData>({
  isPollingActive,
  sessionKey,
  intervalsMs = DEFAULT_INTERVALS_MS,
}: UseSmartPollingOptions<TData>) {
  const pollingRef = useRef({ sessionKey: 0, dataUpdatedAt: 0, intervalIndex: 0 });

  return useCallback(
    (query: { state: { data: TData | undefined; dataUpdatedAt: number } }) => {
      if (sessionKey === 0 || !isPollingActive(query.state.data)) return false;

      const polling = pollingRef.current;
      if (polling.sessionKey !== sessionKey) {
        polling.sessionKey = sessionKey;
        polling.dataUpdatedAt = query.state.dataUpdatedAt;
        polling.intervalIndex = 0;
      } else if (polling.dataUpdatedAt !== query.state.dataUpdatedAt) {
        polling.dataUpdatedAt = query.state.dataUpdatedAt;
        polling.intervalIndex += 1;
      }

      return intervalsMs[polling.intervalIndex] ?? false;
    },
    [intervalsMs, isPollingActive, sessionKey]
  );
}
