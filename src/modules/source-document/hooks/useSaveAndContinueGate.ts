"use client";

import { useCallback } from "react";
import { useConfirmGate } from "@/hooks/use-confirm-gate";

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
  const gate = useConfirmGate<() => void | Promise<void>>();

  const requestAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (disabled) return;
      if (hasPendingChanges) {
        gate.requestConfirmation(action);
        return;
      }
      void action();
    },
    [disabled, gate.requestConfirmation, hasPendingChanges]
  );

  const confirmSaveAndContinue = useCallback(async () => {
    const saved = await onSave();
    if (!saved) return false;
    const action = gate.resolveConfirmation();
    await action?.();
    return true;
  }, [gate.resolveConfirmation, onSave]);

  const confirmDiscardAndContinue = useCallback(async () => {
    onDiscard();
    const action = gate.resolveConfirmation();
    await action?.();
  }, [gate.resolveConfirmation, onDiscard]);

  return {
    confirmOpen: gate.confirmOpen,
    setConfirmOpen: gate.setConfirmOpen,
    requestAction,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
  };
}
