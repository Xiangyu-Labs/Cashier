"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export type PullToRefreshCallback = () => Promise<void> | void;

interface PullToRefreshContextValue {
  setRefresh: (callback: PullToRefreshCallback | null) => void;
  getRefresh: () => PullToRefreshCallback | null;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(null);

/**
 * Shell-owned pull-to-refresh state.
 *
 * The App Shell renders exactly one refresh surface and one indicator.
 * Each tab registers its own refresh callback via `useRegisterPullToRefresh`
 * while mounted, so only the active tab's callback can be triggered and no
 * tab-level gesture wiring is needed.
 */
export function PullToRefreshProvider({ children }: { children: ReactNode }) {
  const refreshRef = useRef<PullToRefreshCallback | null>(null);

  const setRefresh = useCallback((callback: PullToRefreshCallback | null) => {
    refreshRef.current = callback;
  }, []);

  const getRefresh = useCallback(() => refreshRef.current, []);

  const value = useMemo(() => ({ setRefresh, getRefresh }), [getRefresh, setRefresh]);

  return <PullToRefreshContext.Provider value={value}>{children}</PullToRefreshContext.Provider>;
}

export function usePullToRefreshContext(): PullToRefreshContextValue {
  const context = useContext(PullToRefreshContext);
  if (context == null) {
    throw new Error("usePullToRefreshContext must be used within PullToRefreshProvider");
  }
  return context;
}

/**
 * Registers the current tab's refresh callback with the Shell surface.
 *
 * The latest callback is kept in a ref so the gesture handler always invokes
 * fresh closures without re-registering touch listeners. When `enabled` is
 * false or the tab unmounts, the registration is cleared so no stale tab can
 * be refreshed.
 */
export function useRegisterPullToRefresh(onRefresh: PullToRefreshCallback, enabled = true): void {
  const { setRefresh } = usePullToRefreshContext();
  const callbackRef = useRef(onRefresh);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) {
      setRefresh(null);
      return;
    }
    setRefresh(() => callbackRef.current());
    return () => setRefresh(null);
  }, [enabled, setRefresh]);
}
