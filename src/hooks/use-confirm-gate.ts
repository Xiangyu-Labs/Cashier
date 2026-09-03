"use client";

import { useCallback, useRef, useState } from "react";

export function useConfirmGate<T>() {
  const [confirmOpen, setConfirmOpenState] = useState(false);
  const pendingValueRef = useRef<T | null>(null);

  const requestConfirmation = useCallback((value: T) => {
    pendingValueRef.current = value;
    setConfirmOpenState(true);
  }, []);

  const setConfirmOpen = useCallback((next: boolean) => {
    setConfirmOpenState(next);
    if (!next) pendingValueRef.current = null;
  }, []);

  const resolveConfirmation = useCallback(() => {
    const value = pendingValueRef.current;
    pendingValueRef.current = null;
    setConfirmOpenState(false);
    return value;
  }, []);

  const cancelConfirmation = useCallback(() => {
    pendingValueRef.current = null;
    setConfirmOpenState(false);
  }, []);

  const peekConfirmation = useCallback(() => pendingValueRef.current, []);

  return {
    confirmOpen,
    setConfirmOpen,
    requestConfirmation,
    resolveConfirmation,
    cancelConfirmation,
    peekConfirmation,
  };
}
