"use client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SourceDocumentEditRetryDialog } from "@/modules/source-document/ui";
import type { TaskQueueDeleteConfirmState } from "./taskQueueModal.types";

interface TaskQueueDialogsProps {
  ledgerId: string;
  retrySourceDocId: string | null;
  deleteConfirm: TaskQueueDeleteConfirmState;
  onCloseRetryDialog: () => void;
  onCloseDeleteConfirm: () => void;
  onDeleteConfirm: () => void;
  onRetrySuccess: () => void | Promise<void>;
}

export function TaskQueueDialogs({
  ledgerId,
  retrySourceDocId,
  deleteConfirm,
  onCloseRetryDialog,
  onCloseDeleteConfirm,
  onDeleteConfirm,
  onRetrySuccess,
}: TaskQueueDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => !open && onCloseDeleteConfirm()}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        onConfirm={onDeleteConfirm}
        variant="destructive"
      />

      {retrySourceDocId != null && retrySourceDocId !== "" && (
        <SourceDocumentEditRetryDialog
          ledgerId={ledgerId}
          sourceDocument={{ id: retrySourceDocId }}
          open={retrySourceDocId != null && retrySourceDocId !== ""}
          onOpenChange={(open) => !open && onCloseRetryDialog()}
          onSuccess={onRetrySuccess}
        />
      )}
    </>
  );
}
