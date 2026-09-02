"use client";

import { useCallback, useRef, useState } from "react";

interface UseSaveAndContinueGateOptions {
  disabled: boolean;
  hasPendingChanges: boolean;
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
}

/**
 * Gates an action behind a "save changes first?" prompt whenever there are
 * pending edits — shared by every entry point that acts outside the current
 * edit (batch actions, split, add/delete entry, candidate actions).
 */
export function useSaveAndContinueGate({
  disabled,
  hasPendingChanges,
  onSave,
  onDiscard,
}: UseSaveAndContinueGateOptions) {
  const [confirmOpen, setConfirmOpenState] = useState(false);
  const continueActionRef = useRef<(() => void | Promise<void>) | null>(null);

  const requestAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (disabled) return;
      if (hasPendingChanges) {
        continueActionRef.current = action;
        setConfirmOpenState(true);
        return;
      }
      void action();
    },
    [disabled, hasPendingChanges]
  );

  const setConfirmOpen = useCallback((next: boolean) => {
    setConfirmOpenState(next);
    if (!next) continueActionRef.current = null;
  }, []);

  const confirmSaveAndContinue = useCallback(async () => {
    const saved = await onSave();
    if (!saved) return false;
    const action = continueActionRef.current;
    continueActionRef.current = null;
    setConfirmOpenState(false);
    await action?.();
    return true;
  }, [onSave]);

  const confirmDiscardAndContinue = useCallback(async () => {
    onDiscard();
    const action = continueActionRef.current;
    continueActionRef.current = null;
    setConfirmOpenState(false);
    await action?.();
  }, [onDiscard]);

  return {
    confirmOpen,
    setConfirmOpen,
    requestAction,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
  };
}
