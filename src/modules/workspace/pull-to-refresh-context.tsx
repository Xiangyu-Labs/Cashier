"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PullToRefreshCallback = () => Promise<void> | void;

interface PullToRefreshContextValue {
  setRefresh: (callback: PullToRefreshCallback | null) => void;
  getRefresh: () => PullToRefreshCallback | null;
  registerExternalLoading: () => () => void;
  isExternalLoading: boolean;
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
  const externalLoadingTokensRef = useRef(new Set<symbol>());
  const externalLoadingSyncScheduledRef = useRef(false);
  const [externalLoadingCount, setExternalLoadingCount] = useState(0);

  const setRefresh = useCallback((callback: PullToRefreshCallback | null) => {
    refreshRef.current = callback;
  }, []);

  const getRefresh = useCallback(() => refreshRef.current, []);

  const registerExternalLoading = useCallback(() => {
    const token = Symbol("external-loading");
    externalLoadingTokensRef.current.add(token);
    setExternalLoadingCount(externalLoadingTokensRef.current.size);

    return () => {
      externalLoadingTokensRef.current.delete(token);
      if (externalLoadingSyncScheduledRef.current) return;
      externalLoadingSyncScheduledRef.current = true;
      queueMicrotask(() => {
        externalLoadingSyncScheduledRef.current = false;
        setExternalLoadingCount(externalLoadingTokensRef.current.size);
      });
    };
  }, []);

  const value = useMemo(
    () => ({
      setRefresh,
      getRefresh,
      registerExternalLoading,
      isExternalLoading: externalLoadingCount > 0,
    }),
    [externalLoadingCount, getRefresh, registerExternalLoading, setRefresh]
  );

  return <PullToRefreshContext.Provider value={value}>{children}</PullToRefreshContext.Provider>;
}

export function useExternalLoadingActivity(): boolean {
  return usePullToRefreshContext().isExternalLoading;
}

export function useRegisterExternalLoadingActivity(active = true): void {
  const { registerExternalLoading } = usePullToRefreshContext();

  useEffect(() => {
    if (!active) return;
    return registerExternalLoading();
  }, [active, registerExternalLoading]);
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
