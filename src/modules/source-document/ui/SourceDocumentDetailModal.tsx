"use client";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type {
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { memo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { SourceDocumentViewDetails } from "./SourceDocumentViewDetails";
import { EditableField } from "@/components/ui/editable-field";
import type { AddEntryData } from "@/modules/source-document/hooks/useSourceDocumentDetailMutations";
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui/batch-action-toolbar";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import { useSourceDocumentDetailController } from "@/modules/source-document/hooks/useSourceDocumentDetailController";
import { SourceDocumentDetailFooterActions } from "./SourceDocumentDetailFooterActions";
import { SourceDocumentDetailStatusPanels } from "./SourceDocumentDetailStatusPanels";
import { SourceDocumentDetailConfirmDialogs } from "./SourceDocumentDetailConfirmDialogs";
import { SourceDocumentDetailOverlays } from "./SourceDocumentDetailOverlays";

interface SourceDocumentDetailModalProps {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  isLoading?: boolean;
  isLoadingImages?: boolean;
  loadError?: boolean;
  onReload?: () => Promise<void>;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
  preferredCurrencies: string[];
  mainCurrency: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  onSaveAll?: (input: {
    expectedRevisionId: string;
    operationId: string;
    changes: PendingChanges;
  }) => Promise<unknown>;
  onSplit?: (
    input: Omit<SplitSourceDocumentInput, "sourceDocumentId">
  ) => Promise<SplitSourceDocumentResultDto>;
  onBatchUpdate: (
    ids: string[],
    data: {
      categoryId?: string | null;
      currency?: string;
      entryDate?: string;
      description?: string;
    }
  ) => Promise<{ affectedCount: number } | undefined>;
  onBatchDeleteEntries: (ids: string[]) => Promise<string[]>;
  onAddEntry?: (data: AddEntryData) => Promise<unknown>;
  onDeleteEntry?: (entryId: string) => Promise<unknown>;
  onDelete?: () => void | Promise<void>;
  // Recovery action callbacks
  onAcceptCandidate?: () => Promise<void>;
  onAbandonCandidate?: () => Promise<void>;
  onCancelProcessing?: () => Promise<void>;
  isAccepting?: boolean;
  isAbandoning?: boolean;
  isCancelling?: boolean;
}

function SourceDocumentDetailEditor({
  ledgerId,
  sourceDocument,
  isLoading = false,
  isLoadingImages = false,
  loadError = false,
  onReload,
  ledgerEntries,
  categories,
  preferredCurrencies,
  mainCurrency,
  open,
  onClose,
  onBack,
  onExitComplete,
  onSaveAll,
  onSplit,
  onBatchUpdate,
  onBatchDeleteEntries,
  onAddEntry,
  onDeleteEntry,
  onDelete,
  onAcceptCandidate,
  onAbandonCandidate,
  onCancelProcessing,
  isAccepting = false,
  isAbandoning = false,
  isCancelling = false,
}: SourceDocumentDetailModalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { editor, selection, status, dialogs, actions } = useSourceDocumentDetailController({
    ledgerId,
    sourceDocument,
    ledgerEntries,
    open,
    isAccepting,
    isAbandoning,
    isCancelling,
    onClose,
    onReload,
    onSaveAll,
    onSplit,
    onBatchUpdate,
    onBatchDeleteEntries,
    onAddEntry,
    onDeleteEntry,
    onDelete,
    onAcceptCandidate,
    onAbandonCandidate,
    onCancelProcessing,
    t,
    tCommon,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && !status.busy && actions.handleClose()}>
        <DialogContent
          variant="detail"
          {...(onExitComplete !== undefined ? { onExitComplete } : {})}
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onOpenAutoFocus={() => {
            restoreFocusRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusRef.current?.focus();
          }}
          aria-describedby={undefined}
          hideCloseButton={status.busy}
          onEscapeKeyDown={(event) => status.busy && event.preventDefault()}
          onPointerDownOutside={(event) => status.busy && event.preventDefault()}
        >
          <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-3">
            <DialogTitle className="sr-only">{editor.displayTitle}</DialogTitle>
            {onBack != null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                disabled={status.busy}
                aria-label={tCommon("back")}
                title={tCommon("back")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0 pr-8">
              <EditableField
                value={editor.displayTitle}
                onChange={(v) => editor.handleSourceDocChange({ title: v })}
                placeholder={t("untitled")}
                displayClassName="font-semibold text-text text-base truncate"
                inputClassName="font-semibold text-base"
                disabled={status.busy || !editor.isEditMode}
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <SourceDocumentDetailStatusPanels
              sourceDocument={sourceDocument}
              loadError={loadError}
              isLoading={isLoading}
              isReloading={status.isReloading}
              reloadError={status.reloadError}
              hasRevisionConflict={status.hasRevisionConflict}
              onClose={onClose}
              onReload={() => void actions.handleReload()}
            />

            {sourceDocument && (
              <>
                <SourceDocumentViewDetails
                  sourceDocument={sourceDocument}
                  ledgerEntries={ledgerEntries}
                  categories={categories}
                  preferredCurrencies={preferredCurrencies}
                  mainCurrency={mainCurrency}
                  pendingChanges={editor.pendingChanges}
                  selectedEntryIds={selection.selectedIds}
                  isSelectionMode={selection.isSelectionMode}
                  isLoadingImages={isLoadingImages}
                  onSourceDocChange={editor.handleSourceDocChange}
                  onEntryChange={editor.handleEntryChange}
                  onSelectEntry={selection.handleSelect}
                  onToggleSelectionMode={actions.handleToggleSelectionMode}
                  interactionDisabled={status.busy}
                  isEditMode={editor.isEditMode}
                  onAddEntry={actions.handleOpenAddEntry}
                  onDeleteEntry={actions.handleRequestDeleteEntry}
                />
              </>
            )}
          </div>

          {selection.isSelectionMode && (
            <LedgerEntriesBatchActionToolbar
              selectedCount={selection.selectedIds.length}
              totalCount={ledgerEntries.length}
              isAllSelected={selection.isAllSelected}
              onSelectAll={() => selection.handleSelectAll(true)}
              onClearSelection={() => selection.handleSelectAll(false)}
              onChangeCategory={actions.handleBatchCategory}
              onChangeCurrency={actions.handleBatchCurrency}
              {...(sourceDocument?.supportedActions.includes("split_entries") && onSplit != null
                ? { onSplit: actions.handleOpenSplit }
                : {})}
              onDelete={actions.handleOpenBatchDelete}
              categories={categories}
              preferredCurrencies={preferredCurrencies}
              isChangingCategory={status.isSaving}
              isChangingCurrency={status.isSaving}
              isProcessing={status.busy}
              variant="inline"
            />
          )}

          <SourceDocumentDetailFooterActions
            sourceDocument={sourceDocument}
            isEditMode={editor.isEditMode}
            isSelectionMode={selection.isSelectionMode}
            busy={status.busy}
            interactionDisabled={status.interactionDisabled}
            hasPendingChanges={editor.hasPendingChanges}
            hasRevisionConflict={status.hasRevisionConflict}
            pendingChangesCount={editor.pendingChangesCount}
            isAccepting={isAccepting}
            isAbandoning={isAbandoning}
            isCancelling={isCancelling}
            {...(onAcceptCandidate != null
              ? { onAcceptCandidate: actions.handleAcceptCandidate }
              : {})}
            {...(onAbandonCandidate != null
              ? { onAbandonCandidate: actions.handleAbandonCandidate }
              : {})}
            {...(onCancelProcessing != null
              ? { onCancelProcessing: actions.handleCancelProcessing }
              : {})}
            onOpenRetryDialog={actions.handleOpenRetry}
            onRequestDelete={actions.handleRequestDelete}
            onCancelEditMode={actions.handleCancelEditMode}
            onEditSave={actions.handleEditSave}
            onEnterEditMode={actions.handleEnterEditMode}
          />
        </DialogContent>

        <SourceDocumentDetailConfirmDialogs
          t={t}
          tCommon={tCommon}
          showBatchModePendingConfirm={dialogs.showBatchModePendingConfirm}
          setShowBatchModePendingConfirm={dialogs.setShowBatchModePendingConfirm}
          handleSaveAndEnterBatchMode={actions.handleSaveAndEnterBatchMode}
          handleDiscardAndEnterBatchMode={actions.handleDiscardAndEnterBatchMode}
          showBatchDeleteConfirm={dialogs.showBatchDeleteConfirm}
          setShowBatchDeleteConfirm={dialogs.setShowBatchDeleteConfirm}
          selectedCount={selection.selectedIds.length}
          handleBatchDelete={actions.handleBatchDelete}
          pendingDeleteEntryId={dialogs.pendingDeleteEntryId}
          setPendingDeleteEntryId={dialogs.setPendingDeleteEntryId}
          handleDeleteEntry={actions.handleDeleteEntry}
          showDeleteConfirm={dialogs.showDeleteConfirm}
          setShowDeleteConfirm={dialogs.setShowDeleteConfirm}
          handleDeleteDocument={actions.handleDeleteDocument}
          saveAndContinueGate={dialogs.saveAndContinueGate}
          handleSaveAllAndClose={actions.handleSaveAllAndClose}
          unsavedGuard={dialogs.unsavedGuard}
          handleDiscardAndClose={actions.handleDiscardAndClose}
        />
      </Dialog>
      <SourceDocumentDetailOverlays
        ledgerId={ledgerId}
        sourceDocument={sourceDocument}
        showRetryDialog={dialogs.showRetryDialog}
        setShowRetryDialog={dialogs.setShowRetryDialog}
        onRetryPendingChange={status.setIsRetrying}
        onRetrySuccess={() => {
          dialogs.setShowRetryDialog(false);
          onClose();
        }}
        ledgerEntries={ledgerEntries}
        selectedIds={selection.selectedIds}
        splitInitialDate={editor.splitInitialDate}
        isSplitting={status.isSplitting}
        showSplitDialog={dialogs.showSplitDialog}
        setShowSplitDialog={dialogs.setShowSplitDialog}
        handleSplit={actions.handleSplit}
        showAddEntryDialog={dialogs.showAddEntryDialog}
        onAddEntry={onAddEntry}
        categories={categories}
        preferredCurrencies={preferredCurrencies}
        mainCurrency={mainCurrency}
        isSaving={status.isSaving}
        setShowAddEntryDialog={dialogs.setShowAddEntryDialog}
        handleAddEntrySubmit={actions.handleAddEntrySubmit}
      />
    </>
  );
}

export const SourceDocumentDetailModal = memo(function SourceDocumentDetailModal(
  props: SourceDocumentDetailModalProps
) {
  const editorKey = props.sourceDocument?.id ?? "empty";
  return <SourceDocumentDetailEditor key={editorKey} {...props} />;
});
