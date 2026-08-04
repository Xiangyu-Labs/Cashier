"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type NetworkStatus = "online" | "checking" | "offline" | "recovered";
export type SyncStatus = "idle" | "checking" | "downloading" | "updated" | "error";
export type ConnectionStatus = NetworkStatus;

interface ConnectionState {
  networkStatus: NetworkStatus;
  syncStatus: SyncStatus;
  /** Compatibility alias for consumers that only care about connectivity. */
  status: NetworkStatus;
  retryInSeconds: number | null;
  retry: () => void;
  setSyncStatus: (status: SyncStatus) => void;
}

const ConnectionContext = createContext<ConnectionState>({
  networkStatus: "online",
  syncStatus: "idle",
  status: "online",
  retryInSeconds: null,
  retry: () => {},
  setSyncStatus: () => {},
});

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;
const PROBE_TIMEOUT_MS = 4_000;
const CONFIRMATION_DELAY_MS = 1_000;

export function ConnectionStateProvider({ children }: { children: React.ReactNode }) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("online");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const failureCountRef = useRef(0);
  const wasOfflineRef = useRef(false);
  const retryAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const probeGenerationRef = useRef(0);
  const probeControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef<NetworkStatus>("online");
  const probeRef = useRef<(() => Promise<boolean>) | null>(null);

  const updateNetworkStatus = useCallback((status: NetworkStatus) => {
    statusRef.current = status;
    setNetworkStatus(status);
  }, []);

  const clearRecoveredTimer = useCallback(() => {
    if (recoveredTimerRef.current != null) clearTimeout(recoveredTimerRef.current);
    recoveredTimerRef.current = null;
  }, []);

  const updateRetryDeadline = useCallback((deadline: number | null) => {
    retryAtRef.current = deadline;
    setRetryAt(deadline);
    // A newly-created deadline must use the same clock sample as the
    // countdown render, otherwise the first visible value can be stale.
    setNow(Date.now());
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleProbe = useCallback(
    (deadline: number) => {
      clearRetryTimer();
      updateRetryDeadline(deadline);
      if (document.visibilityState !== "visible") return;

      const delay = Math.max(0, deadline - Date.now());
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const activeDeadline = retryAtRef.current;
        if (activeDeadline == null || document.visibilityState !== "visible") return;
        if (activeDeadline > Date.now()) {
          scheduleProbe(activeDeadline);
          return;
        }
        void probeRef.current?.();
      }, delay);
    },
    [clearRetryTimer, updateRetryDeadline]
  );

  const clearScheduledProbe = useCallback(() => {
    clearRetryTimer();
    updateRetryDeadline(null);
  }, [clearRetryTimer, updateRetryDeadline]);

  const probe = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current != null) return inFlightRef.current;

    // Manual retries, online events, and an expired automatic timer all
    // consume the current deadline before starting a new probe. A failed
    // probe below will create the next deadline from the retained count.
    clearScheduledProbe();
    if (!navigator.onLine) {
      wasOfflineRef.current = true;
      clearRecoveredTimer();
      updateNetworkStatus("offline");
      const index = Math.min(Math.max(0, failureCountRef.current - 1), RETRY_DELAYS_MS.length - 1);
      const delay = RETRY_DELAYS_MS[index]!;
      failureCountRef.current += 1;
      scheduleProbe(Date.now() + delay);
      return false;
    }

    if (statusRef.current !== "online") updateNetworkStatus("checking");
    const generation = ++probeGenerationRef.current;
    const run = (async () => {
      const controller = new AbortController();
      probeControllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/health?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Health probe failed");
        if (generation !== probeGenerationRef.current || !navigator.onLine) return false;
        failureCountRef.current = 0;
        clearScheduledProbe();
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          updateNetworkStatus("recovered");
          clearRecoveredTimer();
          recoveredTimerRef.current = setTimeout(() => {
            if (statusRef.current === "recovered") updateNetworkStatus("online");
          }, 2500);
        } else {
          updateNetworkStatus("online");
        }
        return true;
      } catch {
        if (generation !== probeGenerationRef.current) return false;
        if (!wasOfflineRef.current && failureCountRef.current === 0) {
          failureCountRef.current = 1;
          updateNetworkStatus("checking");
          scheduleProbe(Date.now() + CONFIRMATION_DELAY_MS);
          return false;
        }
        wasOfflineRef.current = true;
        clearRecoveredTimer();
        updateNetworkStatus("offline");
        const index = Math.min(
          Math.max(0, failureCountRef.current - 1),
          RETRY_DELAYS_MS.length - 1
        );
        const delay = RETRY_DELAYS_MS[index]!;
        failureCountRef.current += 1;
        scheduleProbe(Date.now() + delay);
        return false;
      } finally {
        clearTimeout(timeout);
        if (generation === probeGenerationRef.current) {
          inFlightRef.current = null;
          probeControllerRef.current = null;
        }
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [clearRecoveredTimer, clearScheduledProbe, scheduleProbe, updateNetworkStatus]);

  // Keep timer callbacks on the latest probe without re-registering the
  // document/window listeners every render.
  probeRef.current = probe;

  const resumeScheduledProbe = useCallback(() => {
    const deadline = retryAtRef.current;
    if (deadline == null) {
      void probeRef.current?.();
      return;
    }
    if (document.visibilityState !== "visible") {
      clearRetryTimer();
      return;
    }
    if (deadline <= Date.now()) {
      clearRetryTimer();
      void probeRef.current?.();
      return;
    }
    scheduleProbe(deadline);
  }, [clearRetryTimer, scheduleProbe]);

  useEffect(() => {
    if (navigator.onLine) void probe();
    else {
      wasOfflineRef.current = true;
      updateNetworkStatus("offline");
    }
    const online = () => {
      probeGenerationRef.current += 1;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      inFlightRef.current = null;
      void probe();
    };
    const offline = () => {
      probeGenerationRef.current += 1;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      inFlightRef.current = null;
      wasOfflineRef.current = true;
      clearRecoveredTimer();
      updateNetworkStatus("offline");
    };
    const immediate = () => {
      if (document.visibilityState === "visible") resumeScheduledProbe();
    };
    const visibility = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") resumeScheduledProbe();
      else clearRetryTimer();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", immediate);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearRetryTimer();
      clearRecoveredTimer();
      probeGenerationRef.current += 1;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      inFlightRef.current = null;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", immediate);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clearRecoveredTimer, clearRetryTimer, probe, resumeScheduledProbe, updateNetworkStatus]);

  useEffect(() => {
    if (retryAt == null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);

  const retryInSeconds = retryAt == null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const retry = useCallback(() => void probe(), [probe]);
  return (
    <ConnectionContext.Provider
      value={{
        networkStatus,
        syncStatus,
        status: networkStatus,
        retryInSeconds,
        retry,
        setSyncStatus,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnectionState() {
  return useContext(ConnectionContext);
}
