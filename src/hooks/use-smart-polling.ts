import { useCallback } from "react";

interface UseSmartPollingOptions<TData> {
  isPollingActive: (data: TData | undefined) => boolean;
  activeIntervalMs?: number;
  idleIntervalMs?: number | false;
}

export function useSmartPolling<TData>({
  isPollingActive,
  activeIntervalMs = 3000,
  idleIntervalMs = false,
}: UseSmartPollingOptions<TData>) {
  return useCallback(
    (query: { state: { data: TData | undefined } }) =>
      isPollingActive(query.state.data) ? activeIntervalMs : idleIntervalMs,
    [activeIntervalMs, idleIntervalMs, isPollingActive]
  );
}
