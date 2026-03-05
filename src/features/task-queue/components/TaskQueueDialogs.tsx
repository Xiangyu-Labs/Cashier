"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SourceDocumentEditRetryDialog } from "@/features/ledger/components/SourceDocumentEditRetryDialog";
import type { QueueItem } from "../types/queue-item";

interface TaskQueueDialogsProps {
  ledgerId: string;
  retrySourceDocId: string | null;
  deleteConfirm: {
    open: boolean;
    type: "single" | "all" | null;
    id: string | null;
    title: string;
    description: string;
  };
  onRetrySourceDocIdChange: (id: string | null) => void;
  onDeleteConfirmChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  onRetrySuccess: () => void;
}

export function TaskQueueDialogs({
  ledgerId,
  retrySourceDocId,
  deleteConfirm,
  onRetrySourceDocIdChange,
  onDeleteConfirmChange,
  onDeleteConfirm,
  onRetrySuccess,
}: TaskQueueDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={onDeleteConfirmChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        onConfirm={onDeleteConfirm}
        variant="destructive"
      />

      {retrySourceDocId && (
        <SourceDocumentEditRetryDialog
          ledgerId={ledgerId}
          sourceDocument={{ id: retrySourceDocId }}
          open={!!retrySourceDocId}
          onOpenChange={(open) => !open && onRetrySourceDocIdChange(null)}
          onSuccess={onRetrySuccess}
        />
      )}
    </>
  );
}
