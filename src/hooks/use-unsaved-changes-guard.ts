"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

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
  const [confirmOpen, setConfirmOpenState] = useState(false);
  const continueNavigationRef = useRef<(() => void) | null>(null);

  const requestLeave = useCallback((continueNavigation: (() => void) | null) => {
    continueNavigationRef.current = continueNavigation;
    setConfirmOpenState(true);
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
      return;
    }
    useUnsavedChangesStore.getState().registerLeaveGuard(key, { requestLeave });
    return () => useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
  }, [hasUnsavedChanges, key, requestLeave]);

  const setConfirmOpen = useCallback((next: boolean) => {
    setConfirmOpenState(next);
    if (!next) continueNavigationRef.current = null;
  }, []);

  /** Clears the pending continuation and closes the dialog; returns the continuation (or null) to run. */
  const resolveLeave = useCallback(() => {
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    setConfirmOpenState(false);
    return continueNavigation;
  }, []);

  return { confirmOpen, setConfirmOpen, requestLeave, resolveLeave };
}
