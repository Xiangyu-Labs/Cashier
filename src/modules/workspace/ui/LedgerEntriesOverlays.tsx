import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  SourceDocumentBatchActionToolbar,
  SourceDocumentEditRetryDialog,
} from "@/modules/source-document/ui";
import type { SourceDocument } from "@/modules/source-document/contracts";
import type { LedgerEntriesDeleteConfirmState } from "./useLedgerEntriesTabState";

interface LedgerEntriesOverlaysProps {
  deleteConfirm: LedgerEntriesDeleteConfirmState;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  deleteLabel: string;
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUpdateDates: (date: string) => void;
  onRetry: () => void;
  onDelete: () => void;
  isUpdatingDates: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  retrySourceDocument: SourceDocument | null;
  onRetryDialogOpenChange: (open: boolean) => void;
  ledgerId: string;
}

export function LedgerEntriesOverlays({
  deleteConfirm,
  onDeleteConfirmOpenChange,
  onDeleteConfirm,
  deleteLabel,
  selectedCount,
  totalCount,
  isAllSelected,
  onSelectAll,
  onClearSelection,
  onUpdateDates,
  onRetry,
  onDelete,
  isUpdatingDates,
  isRetrying,
  isDeleting,
  retrySourceDocument,
  onRetryDialogOpenChange,
  ledgerId,
}: LedgerEntriesOverlaysProps) {
  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={onDeleteConfirmOpenChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        onConfirm={onDeleteConfirm}
        confirmLabel={deleteLabel}
        variant="destructive"
      />

      <SourceDocumentBatchActionToolbar
        selectedCount={selectedCount}
        totalCount={totalCount}
        isAllSelected={isAllSelected}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onUpdateDates={onUpdateDates}
        onRetry={onRetry}
        onDelete={onDelete}
        isUpdatingDates={isUpdatingDates}
        isRetrying={isRetrying}
        isDeleting={isDeleting}
      />

      {retrySourceDocument && (
        <SourceDocumentEditRetryDialog
          sourceDocument={retrySourceDocument}
          open={true}
          onOpenChange={onRetryDialogOpenChange}
          ledgerId={ledgerId}
        />
      )}
    </>
  );
}
