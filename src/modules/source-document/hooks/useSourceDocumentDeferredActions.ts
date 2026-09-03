"use client";

import { useCallback } from "react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirmGate } from "@/hooks/use-confirm-gate";
import type { SourceDocumentDeferredAction } from "./source-document-deferred-action";

interface DeferredRequest {
  action: SourceDocumentDeferredAction;
  contextKey: string;
}

interface UseSourceDocumentDeferredActionsOptions {
  contextKey: string;
  interactionDisabled: boolean;
  hasRevisionConflict: boolean;
  hasPendingChanges: boolean;
  saveAll: () => Promise<boolean>;
  discardAllChanges: () => void;
  executeAction: (action: SourceDocumentDeferredAction) => void | Promise<void>;
  t: ReturnType<typeof useTranslations>;
}

export function useSourceDocumentDeferredActions({
  contextKey,
  interactionDisabled,
  hasRevisionConflict,
  hasPendingChanges,
  saveAll,
  discardAllChanges,
  executeAction,
  t,
}: UseSourceDocumentDeferredActionsOptions) {
  const gate = useConfirmGate<DeferredRequest>();

  const requestAction = useCallback(
    (action: SourceDocumentDeferredAction) => {
      if (interactionDisabled || hasRevisionConflict) return;
      if (hasPendingChanges) {
        gate.requestConfirmation({ action, contextKey });
        return;
      }
      void executeAction(action);
    },
    [contextKey, executeAction, gate, hasPendingChanges, hasRevisionConflict, interactionDisabled]
  );

  const resolveCurrentRequest = useCallback(() => {
    const request = gate.peekConfirmation();
    if (request == null) return null;
    if (request.contextKey === contextKey) return request;
    gate.cancelConfirmation();
    toast.error(t("actionContextChanged"));
    return null;
  }, [contextKey, gate, t]);

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
