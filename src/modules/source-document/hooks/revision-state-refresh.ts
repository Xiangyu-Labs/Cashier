"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";

export const REVISION_REFRESH_INTERVAL_MS = 3_000;

export function isRefreshableRevisionState(status: SourceDocumentStatusType): boolean {
  return status === "processing";
}

export interface UseRevisionStateRefreshOptions {
  enabled: boolean;
  pending: boolean;
  refresh: () => Promise<{
    changed: boolean;
    result?: { hasTransitionalWork: boolean };
  }>;
}

export function useRevisionStateRefresh(options: UseRevisionStateRefreshOptions): void {
  const inFlightRef = useRef(false);
  const refresh = useEffectEvent(options.refresh);

  useEffect(() => {
    if (!options.enabled || !options.pending) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };
    const canRefresh = () =>
      document.visibilityState === "visible" && navigator.onLine && !disposed;
    const schedule = () => {
      clearTimer();
      if (canRefresh()) timer = setTimeout(run, REVISION_REFRESH_INTERVAL_MS);
    };
    const run = async () => {
      if (!canRefresh() || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await refresh();
      } catch {
        // Query state owns refresh errors. Retry at the normal fixed interval.
      } finally {
        inFlightRef.current = false;
        if (!disposed) schedule();
      }
    };
    const resume = () => {
      clearTimer();
      if (canRefresh()) void run();
    };
    const pauseOrResume = () => {
      if (canRefresh()) resume();
      else clearTimer();
    };

    document.addEventListener("visibilitychange", pauseOrResume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", clearTimer);
    void run();

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", pauseOrResume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", clearTimer);
    };
  }, [options.enabled, options.pending]);
}
