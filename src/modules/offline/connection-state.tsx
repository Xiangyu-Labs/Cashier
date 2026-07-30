"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "online" | "checking" | "offline" | "recovered";

interface ConnectionState {
  status: ConnectionStatus;
  retryInSeconds: number | null;
  retry: () => void;
}

const ConnectionContext = createContext<ConnectionState>({
  status: "online",
  retryInSeconds: null,
  retry: () => {},
});

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;
const PROBE_TIMEOUT_MS = 4_000;

export function ConnectionStateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const failureCountRef = useRef(0);
  const wasOfflineRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const clearScheduledProbe = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRetryAt(null);
  }, []);

  const probe = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current != null) return inFlightRef.current;
    clearScheduledProbe();
    if (statusRef.current !== "online") setStatus("checking");
    const run = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/health?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Health probe failed");
        failureCountRef.current = 0;
        setRetryAt(null);
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          setStatus("recovered");
          setTimeout(
            () => setStatus((current) => (current === "recovered" ? "online" : current)),
            2500
          );
        } else {
          setStatus("online");
        }
        return true;
      } catch {
        wasOfflineRef.current = true;
        setStatus("offline");
        const index = Math.min(failureCountRef.current, RETRY_DELAYS_MS.length - 1);
        const delay = RETRY_DELAYS_MS[index]!;
        failureCountRef.current += 1;
        if (document.visibilityState === "visible") {
          setRetryAt(Date.now() + delay);
          timerRef.current = setTimeout(() => void probe(), delay);
        }
        return false;
      } finally {
        clearTimeout(timeout);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [clearScheduledProbe]);

  useEffect(() => {
    void probe();
    const immediate = () => void probe();
    const visibility = () => {
      if (document.visibilityState === "visible") immediate();
      else clearScheduledProbe();
    };
    window.addEventListener("online", immediate);
    window.addEventListener("focus", immediate);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearScheduledProbe();
      window.removeEventListener("online", immediate);
      window.removeEventListener("focus", immediate);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clearScheduledProbe, probe]);

  useEffect(() => {
    if (retryAt == null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);

  const retryInSeconds = retryAt == null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
    <ConnectionContext.Provider value={{ status, retryInSeconds, retry: () => void probe() }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnectionState() {
  return useContext(ConnectionContext);
}
