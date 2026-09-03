"use client";

import { useCallback, useEffect } from "react";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { useConfirmGate } from "@/hooks/use-confirm-gate";

interface UseUnsavedChangesGuardOptions {
  /** Store key this guard registers under; must be unique per active instance. */
  key: string;
  hasUnsavedChanges: boolean;
}

/**
 * Registers a leave-guard with the global unsaved-changes store: in-app
 * navigation away from `key` while `hasUnsavedChanges` is true is intercepted
 * and routed through a local confirmation dialog instead of navigating
 * immediately.
 */
export function useUnsavedChangesGuard({ key, hasUnsavedChanges }: UseUnsavedChangesGuardOptions) {
  const { confirmOpen, setConfirmOpen, requestConfirmation, resolveConfirmation } = useConfirmGate<
    (() => void) | null
  >();

  const requestLeave = useCallback(
    (continueNavigation: (() => void) | null) => requestConfirmation(continueNavigation),
    [requestConfirmation]
  );

  useEffect(() => {
    if (!hasUnsavedChanges) {
      useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
      return;
    }
    useUnsavedChangesStore.getState().registerLeaveGuard(key, { requestLeave });
    return () => useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
  }, [hasUnsavedChanges, key, requestLeave]);

  /** Clears the pending continuation and closes the dialog; returns the continuation (or null) to run. */
  const resolveLeave = resolveConfirmation;

  return { confirmOpen, setConfirmOpen, requestLeave, resolveLeave };
}
