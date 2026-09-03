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
import type { PendingChanges } from "@/modules/source-document/hooks/usePendingChanges";
import { useSourceDocumentDetailState } from "@/modules/source-document/hooks/useSourceDocumentDetailState";
import { useSourceDocumentDetailActions } from "@/modules/source-document/hooks/useSourceDocumentDetailActions";
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

  const state = useSourceDocumentDetailState({
    ledgerId,
    sourceDocument,
    ledgerEntries,
    open,
    isAccepting,
    isAbandoning,
    isCancelling,
  });
  const actions = useSourceDocumentDetailActions({
    ledgerId,
    sourceDocument,
    ledgerEntries,
    state,
    onClose,
    onReload,
    onSaveAll,
    onSplit,
    onBatchUpdate,
    onBatchDeleteEntries,
    onAddEntry,
    onDeleteEntry,
    onDelete,
    t,
    tCommon,
  });

  const {
    pendingChanges,
    hasPendingChanges,
    pendingChangesCount,
    handleSourceDocChange,
    handleEntryChange,
    selectedIds,
    isSelectionMode,
    isAllSelected,
    handleSelect: handleSelectEntry,
    handleSelectAll: handleSelectAllEntries,
    busy,
    interactionDisabled,
    isEditMode,
    isReloading,
    reloadError,
    hasRevisionConflict,
    unsavedGuard,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showBatchDeleteConfirm,
    setShowBatchDeleteConfirm,
    showRetryDialog,
    setShowRetryDialog,
    showSplitDialog,
    setShowSplitDialog,
    showAddEntryDialog,
    setShowAddEntryDialog,
    pendingDeleteEntryId,
    setPendingDeleteEntryId,
    showBatchModePendingConfirm,
    setShowBatchModePendingConfirm,
    isSplitting,
    displayTitle,
    splitInitialDate,
  } = state;

  const {
    handleClose,
    handleEnterEditMode,
    handleCancelEditMode,
    handleEditSave,
    handleToggleSelectionMode,
    handleSaveAndEnterBatchMode,
    handleDiscardAndEnterBatchMode,
    handleSaveAllAndClose,
    handleDiscardAndClose,
    handleReload,
    requestAction,
    saveAndContinueGate,
    handleBatchCategory,
    handleBatchCurrency,
    handleBatchDelete,
    handleOpenSplit,
    handleSplit,
    handleOpenAddEntry,
    handleAddEntrySubmit,
    handleDeleteEntry,
    handleRequestDeleteEntry,
    handleDeleteDocument,
  } = actions;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && !busy && handleClose()}>
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
          hideCloseButton={busy}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => busy && event.preventDefault()}
        >
          <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-3">
            <DialogTitle className="sr-only">{displayTitle}</DialogTitle>
            {onBack != null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                disabled={busy}
                aria-label={tCommon("back")}
                title={tCommon("back")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0 pr-8">
              <EditableField
                value={displayTitle}
                onChange={(v) => handleSourceDocChange({ title: v })}
                placeholder={t("untitled")}
                displayClassName="font-semibold text-text text-base truncate"
                inputClassName="font-semibold text-base"
                disabled={busy || !isEditMode}
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            <SourceDocumentDetailStatusPanels
              sourceDocument={sourceDocument}
              loadError={loadError}
              isLoading={isLoading}
              isReloading={isReloading}
              reloadError={reloadError}
              hasRevisionConflict={hasRevisionConflict}
              onClose={onClose}
              onReload={() => void handleReload()}
            />

            {sourceDocument && (
              <>
                <SourceDocumentViewDetails
                  sourceDocument={sourceDocument}
                  ledgerEntries={ledgerEntries}
                  categories={categories}
                  preferredCurrencies={preferredCurrencies}
                  mainCurrency={mainCurrency}
                  pendingChanges={pendingChanges}
                  selectedEntryIds={selectedIds}
                  isSelectionMode={isSelectionMode}
                  isLoadingImages={isLoadingImages}
                  onSourceDocChange={handleSourceDocChange}
                  onEntryChange={handleEntryChange}
                  onSelectEntry={handleSelectEntry}
                  onToggleSelectionMode={handleToggleSelectionMode}
                  interactionDisabled={busy}
                  isEditMode={isEditMode}
                  onAddEntry={handleOpenAddEntry}
                  onDeleteEntry={handleRequestDeleteEntry}
                />
              </>
            )}
          </div>

          {isSelectionMode && (
            <LedgerEntriesBatchActionToolbar
              selectedCount={selectedIds.length}
              totalCount={ledgerEntries.length}
              isAllSelected={isAllSelected}
              onSelectAll={() => handleSelectAllEntries(true)}
              onClearSelection={() => handleSelectAllEntries(false)}
              onChangeCategory={handleBatchCategory}
              onChangeCurrency={handleBatchCurrency}
              {...(sourceDocument?.supportedActions.includes("split_entries") && onSplit != null
                ? { onSplit: handleOpenSplit }
                : {})}
              onDelete={() => requestAction(() => setShowBatchDeleteConfirm(true))}
              categories={categories}
              preferredCurrencies={preferredCurrencies}
              isChangingCategory={state.isSaving}
              isChangingCurrency={state.isSaving}
              isProcessing={busy}
              variant="inline"
            />
          )}

          <SourceDocumentDetailFooterActions
            sourceDocument={sourceDocument}
            isEditMode={isEditMode}
            isSelectionMode={isSelectionMode}
            busy={busy}
            interactionDisabled={interactionDisabled}
            hasPendingChanges={hasPendingChanges}
            hasRevisionConflict={hasRevisionConflict}
            pendingChangesCount={pendingChangesCount}
            isAccepting={isAccepting}
            {...(onAcceptCandidate != null ? { onAcceptCandidate } : {})}
            {...(onAbandonCandidate != null ? { onAbandonCandidate } : {})}
            {...(onCancelProcessing != null ? { onCancelProcessing } : {})}
            requestAction={requestAction}
            onOpenRetryDialog={() => setShowRetryDialog(true)}
            onRequestDelete={() => setShowDeleteConfirm(true)}
            onCancelEditMode={handleCancelEditMode}
            onEditSave={handleEditSave}
            onEnterEditMode={handleEnterEditMode}
          />
        </DialogContent>

        <SourceDocumentDetailConfirmDialogs
          t={t}
          tCommon={tCommon}
          showBatchModePendingConfirm={showBatchModePendingConfirm}
          setShowBatchModePendingConfirm={setShowBatchModePendingConfirm}
          handleSaveAndEnterBatchMode={handleSaveAndEnterBatchMode}
          handleDiscardAndEnterBatchMode={handleDiscardAndEnterBatchMode}
          showBatchDeleteConfirm={showBatchDeleteConfirm}
          setShowBatchDeleteConfirm={setShowBatchDeleteConfirm}
          selectedCount={selectedIds.length}
          handleBatchDelete={handleBatchDelete}
          pendingDeleteEntryId={pendingDeleteEntryId}
          setPendingDeleteEntryId={setPendingDeleteEntryId}
          handleDeleteEntry={handleDeleteEntry}
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          handleDeleteDocument={handleDeleteDocument}
          saveAndContinueGate={saveAndContinueGate}
          handleSaveAllAndClose={handleSaveAllAndClose}
          unsavedGuard={unsavedGuard}
          handleDiscardAndClose={handleDiscardAndClose}
        />
      </Dialog>
      <SourceDocumentDetailOverlays
        ledgerId={ledgerId}
        sourceDocument={sourceDocument}
        showRetryDialog={showRetryDialog}
        setShowRetryDialog={setShowRetryDialog}
        onRetryPendingChange={state.setIsRetrying}
        onRetrySuccess={() => {
          setShowRetryDialog(false);
          onClose();
        }}
        ledgerEntries={ledgerEntries}
        selectedIds={selectedIds}
        splitInitialDate={splitInitialDate}
        isSplitting={isSplitting}
        showSplitDialog={showSplitDialog}
        setShowSplitDialog={setShowSplitDialog}
        handleSplit={handleSplit}
        showAddEntryDialog={showAddEntryDialog}
        onAddEntry={onAddEntry}
        categories={categories}
        preferredCurrencies={preferredCurrencies}
        mainCurrency={mainCurrency}
        isSaving={state.isSaving}
        setShowAddEntryDialog={setShowAddEntryDialog}
        handleAddEntrySubmit={handleAddEntrySubmit}
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
