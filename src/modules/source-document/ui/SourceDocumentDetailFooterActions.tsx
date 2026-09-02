"use client";

import { CheckCheck, RefreshCw, Trash2, X, Save, XCircle, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";

interface SourceDocumentDetailFooterActionsProps {
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  isEditMode: boolean;
  isSelectionMode: boolean;
  busy: boolean;
  interactionDisabled: boolean;
  hasPendingChanges: boolean;
  hasRevisionConflict: boolean;
  pendingChangesCount: number;
  isAccepting: boolean;
  onAcceptCandidate?: () => Promise<void>;
  onAbandonCandidate?: () => Promise<void>;
  onCancelProcessing?: () => Promise<void>;
  requestAction: (action: () => void | Promise<void>) => void;
  onOpenRetryDialog: () => void;
  onRequestDelete: () => void;
  onCancelEditMode: () => void;
  onEditSave: () => Promise<boolean>;
  onEnterEditMode: () => void;
}

/** Non-selection-mode footer bar: candidate actions, edit/retry/delete, and the edit-mode save controls. */
export function SourceDocumentDetailFooterActions({
  sourceDocument,
  isEditMode,
  isSelectionMode,
  busy,
  interactionDisabled,
  hasPendingChanges,
  hasRevisionConflict,
  pendingChangesCount,
  isAccepting,
  onAcceptCandidate,
  onAbandonCandidate,
  onCancelProcessing,
  requestAction,
  onOpenRetryDialog,
  onRequestDelete,
  onCancelEditMode,
  onEditSave,
  onEnterEditMode,
}: SourceDocumentDetailFooterActionsProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");

  return (
    <div className="z-modal-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-surface/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:bg-surface2/30 sm:py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Candidate actions: Accept / Abandon */}
        {sourceDocument?.supportedActions.includes("accept_candidate") &&
          onAcceptCandidate != null && (
            <>
              <Button
                variant="default"
                size="sm"
                className="h-9 px-3 gap-1.5"
                onClick={() => requestAction(onAcceptCandidate)}
                disabled={interactionDisabled}
              >
                <CheckCheck className={cn("h-3.5 w-3.5", isAccepting && "animate-spin")} />
                <span className="hidden sm:inline">{tActions("accept")}</span>
              </Button>
              {sourceDocument.supportedActions.includes("abandon_candidate") &&
                onAbandonCandidate != null && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 gap-1.5 text-muted-foreground"
                    onClick={() => requestAction(onAbandonCandidate)}
                    disabled={interactionDisabled}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{tActions("abandon")}</span>
                  </Button>
                )}
            </>
          )}

        {sourceDocument?.supportedActions.includes("abandon_candidate") &&
          !sourceDocument.supportedActions.includes("accept_candidate") &&
          onAbandonCandidate != null && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-muted-foreground"
              onClick={() => requestAction(onAbandonCandidate)}
              disabled={interactionDisabled}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tActions("abandon")}</span>
            </Button>
          )}

        {sourceDocument?.supportedActions.includes("cancel_processing") &&
          onCancelProcessing != null && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-muted-foreground"
              onClick={() => requestAction(onCancelProcessing)}
              disabled={interactionDisabled}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tActions("cancelProcessing")}</span>
            </Button>
          )}

        {/* Edit & Retry */}
        {sourceDocument?.supportedActions.includes("edit_retry") && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 gap-1.5 text-muted-foreground"
            onClick={() => requestAction(onOpenRetryDialog)}
            disabled={interactionDisabled}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("editRetry")}</span>
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
          onClick={() => requestAction(onRequestDelete)}
          disabled={interactionDisabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{tCommon("delete")}</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {isSelectionMode ? null : isEditMode ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={onCancelEditMode}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              {t("cancelEdit")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 shadow-lg shadow-primary/20"
              onClick={onEditSave}
              disabled={busy || hasRevisionConflict || !hasPendingChanges}
            >
              <Save className="h-3.5 w-3.5" />
              {hasPendingChanges
                ? t("saveChanges", { count: pendingChangesCount })
                : tCommon("save")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={onEnterEditMode}
            disabled={interactionDisabled}
          >
            <Pencil className="h-3.5 w-3.5" />
            {tCommon("edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
