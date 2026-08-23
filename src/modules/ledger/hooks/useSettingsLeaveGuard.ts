"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUnsavedChangesStore, type UnsavedChangesLeaveGuard } from "@/lib/store/unsaved-changes";

function hasSettingsDirtyChanges(): boolean {
  return [...useUnsavedChangesStore.getState().dirtyKeys].some((key) =>
    key.startsWith("settings:")
  );
}

interface UseSettingsLeaveGuardOptions {
  /** Independent settings pages need to restore browser history before prompting. */
  managePopState?: boolean;
}

export function useSettingsLeaveGuard({
  managePopState = false,
}: UseSettingsLeaveGuardOptions = {}) {
  const hasDirtyChanges = useUnsavedChangesStore((state) =>
    [...state.dirtyKeys].some((key) => key.startsWith("settings:"))
  );
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const continueNavigationRef = useRef<(() => void) | null>(null);
  const restoringHistoryRef = useRef(false);
  const bypassPopStateRef = useRef(false);

  const requestLeave = useCallback((continueNavigation: () => void) => {
    continueNavigationRef.current = continueNavigation;
    setLeaveConfirmOpen(true);
  }, []);

  const attemptLeave = useCallback(
    (continueNavigation: () => void) => {
      if (!hasDirtyChanges) {
        continueNavigation();
        return;
      }
      requestLeave(continueNavigation);
    },
    [hasDirtyChanges, requestLeave]
  );

  const confirmLeave = useCallback(() => {
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    setLeaveConfirmOpen(false);
    continueNavigation?.();
  }, []);

  const cancelLeave = useCallback(() => {
    continueNavigationRef.current = null;
    restoringHistoryRef.current = false;
    setLeaveConfirmOpen(false);
  }, []);

  useEffect(() => {
    const key = "settings-navigation";
    if (!hasDirtyChanges) {
      useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
      return;
    }
    const guard: UnsavedChangesLeaveGuard = { requestLeave };
    useUnsavedChangesStore.getState().registerLeaveGuard(key, guard);
    return () => useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
  }, [hasDirtyChanges, requestLeave]);

  useEffect(() => {
    if (!hasDirtyChanges) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [hasDirtyChanges]);

  useEffect(() => {
    if (!managePopState) return;
    const handlePopState = () => {
      if (bypassPopStateRef.current) {
        bypassPopStateRef.current = false;
        return;
      }
      if (!hasSettingsDirtyChanges()) return;
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        requestLeave(() => {
          bypassPopStateRef.current = true;
          window.history.back();
        });
        return;
      }
      restoringHistoryRef.current = true;
      window.history.go(1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [managePopState, requestLeave]);

  return {
    hasDirtyChanges,
    leaveConfirmOpen,
    cancelLeave,
    attemptLeave,
    confirmLeave,
  };
}
