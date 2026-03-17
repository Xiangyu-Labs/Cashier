"use client";

import { useCallback, useSyncExternalStore, useRef, useEffect } from "react";
import { TIME } from "@/lib/constants";

interface UseCountdownOptions {
  targetTime: number | null; // Unix timestamp in seconds
  onExpired?: () => void;
}

interface UseCountdownResult {
  remaining: number; // seconds
  isExpired: boolean;
}

// Global timer store for sharing interval across hook instances
const createTimerStore = () => {
  const listeners: Set<() => void> = new Set();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTick = Date.now();

  const tick = () => {
    lastTick = Date.now();
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (!intervalId) {
      intervalId = setInterval(tick, TIME.SECOND);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  };

  const getSnapshot = () => lastTick;

  return { subscribe, getSnapshot };
};

const timerStore = createTimerStore();

/**
 * Shared countdown hook for timer-based UI components
 *
 * Features:
 * - Updates every second
 * - Calls onExpired callback when timer reaches zero
 * - Returns remaining seconds and expired status
 *
 * Implementation note: This hook uses useSyncExternalStore to avoid
 * the react-hooks/set-state-in-effect ESLint rule violation. The state
 * is calculated during render based on the current time, not updated
 * synchronously within an effect.
 */
export function useCountdown({ targetTime, onExpired }: UseCountdownOptions): UseCountdownResult {
  // Subscribe to the global timer tick (using underscore prefix since we only need the subscription)
  useSyncExternalStore(timerStore.subscribe, timerStore.getSnapshot, timerStore.getSnapshot);

  // Calculate remaining time based on current time
  const calculateRemaining = useCallback(() => {
    if (!targetTime) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, targetTime - now);
  }, [targetTime]);

  // Compute current remaining time during render
  const remaining = calculateRemaining();
  const isExpired = remaining === 0;

  // Use ref to track previous expired state and onExpired callback
  const prevExpiredRef = useRef(isExpired);
  const onExpiredRef = useRef(onExpired);

  // Keep callback ref up to date
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  // Use effect only for side effects (calling onExpired), not for state updates
  useEffect(() => {
    if (isExpired && !prevExpiredRef.current) {
      prevExpiredRef.current = true;
      onExpiredRef.current?.();
    } else if (!isExpired && prevExpiredRef.current) {
      prevExpiredRef.current = false;
    }
  }, [isExpired]);

  return {
    remaining,
    isExpired,
  };
}
