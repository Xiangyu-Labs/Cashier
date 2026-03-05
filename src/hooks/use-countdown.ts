"use client";

import { useState, useEffect, useCallback } from "react";

interface UseCountdownOptions {
  targetTime: number | null; // Unix timestamp in seconds
  onExpired?: () => void;
}

interface UseCountdownResult {
  remaining: number; // seconds
  isExpired: boolean;
}

/**
 * Shared countdown hook for timer-based UI components
 *
 * Features:
 * - Updates every second
 * - Calls onExpired callback when timer reaches zero
 * - Returns remaining seconds and expired status
 */
export function useCountdown({
  targetTime,
  onExpired,
}: UseCountdownOptions): UseCountdownResult {
  const calculateRemaining = useCallback(() => {
    if (!targetTime) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, targetTime - now);
  }, [targetTime]);

  const [remaining, setRemaining] = useState(calculateRemaining);
  const [hasExpired, setHasExpired] = useState(() => calculateRemaining() === 0);

  useEffect(() => {
    if (!targetTime) {
      setRemaining(0);
      setHasExpired(false);
      return;
    }

    const updateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = targetTime - now;
      const newRemaining = Math.max(0, diff);
      setRemaining(newRemaining);

      if (newRemaining === 0 && !hasExpired) {
        setHasExpired(true);
        onExpired?.();
      }
    };

    // Update immediately to ensure accuracy
    updateRemaining();

    // Set up interval for subsequent updates
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetTime, hasExpired, onExpired]);

  return {
    remaining,
    isExpired: hasExpired,
  };
}
