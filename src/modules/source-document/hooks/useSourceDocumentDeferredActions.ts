"use client";

import { useCallback, useEffect } from "react";
import type { useTranslations } from "next-intl";
import { useConfirmGate } from "@/hooks/use-confirm-gate";
import type { SourceDocumentDeferredAction } from "./source-document-deferred-action";

interface DeferredRequest {
  action: SourceDocumentDeferredAction;
}

interface UseSourceDocumentDeferredActionsOptions {
  interactionDisabled: boolean;
  hasVersionConflict: boolean;
  hasPendingChanges: boolean;
  saveAll: () => Promise<boolean>;
  discardAllChanges: () => void;
  executeAction: (action: SourceDocumentDeferredAction) => void | Promise<void>;
  t: ReturnType<typeof useTranslations>;
}

export function useSourceDocumentDeferredActions({
  interactionDisabled,
  hasVersionConflict,
  hasPendingChanges,
  saveAll,
  discardAllChanges,
  executeAction,
  t: _t,
}: UseSourceDocumentDeferredActionsOptions) {
  const gate = useConfirmGate<DeferredRequest>();

  useEffect(() => {
    if (hasVersionConflict) gate.setConfirmOpen(false);
  }, [gate, hasVersionConflict]);

  const requestAction = useCallback(
    (action: SourceDocumentDeferredAction) => {
      if (interactionDisabled || hasVersionConflict) return;
      if (hasPendingChanges) {
        gate.requestConfirmation({ action });
        return;
      }
      void executeAction(action);
    },
    [executeAction, gate, hasPendingChanges, hasVersionConflict, interactionDisabled]
  );

  const resolveCurrentRequest = useCallback(() => {
    const request = gate.peekConfirmation();
    if (request == null) return null;
    return request;
  }, [gate]);

  const confirmSaveAndContinue = useCallback(async () => {
    const request = resolveCurrentRequest();
    if (request == null) return false;
    const saved = await saveAll();
    if (!saved) return false;
    gate.resolveConfirmation();
    await executeAction(request.action);
    return true;
  }, [executeAction, gate, resolveCurrentRequest, saveAll]);

  const confirmDiscardAndContinue = useCallback(async () => {
    const request = resolveCurrentRequest();
    if (request == null) return false;
    discardAllChanges();
    gate.resolveConfirmation();
    await executeAction(request.action);
    return true;
  }, [discardAllChanges, executeAction, gate, resolveCurrentRequest]);

  return {
    requestAction,
    saveAndContinueGate: {
      confirmOpen: gate.confirmOpen,
      setConfirmOpen: gate.setConfirmOpen,
      confirmSaveAndContinue,
      confirmDiscardAndContinue,
    },
  };
}
