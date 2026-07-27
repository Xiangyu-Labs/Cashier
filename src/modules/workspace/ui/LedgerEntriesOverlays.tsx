import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  SourceDocumentCandidateReviewDialog,
  SourceDocumentEditRetryDialog,
} from "@/modules/source-document/ui";
import type { SourceDocument } from "@/modules/source-document/contracts";
import type { LedgerEntriesDeleteConfirmState } from "./useLedgerEntriesTabState";

interface LedgerEntriesOverlaysProps {
  deleteConfirm: LedgerEntriesDeleteConfirmState;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  deleteLabel: string;
  retrySourceDocument: SourceDocument | null;
  onRetryDialogOpenChange: (open: boolean) => void;
  ledgerId: string;
  candidateReviewDocument: SourceDocument | null;
  onCandidateReviewOpenChange: (open: boolean) => void;
  mainCurrency: string;
}

export function LedgerEntriesOverlays({
  deleteConfirm,
  onDeleteConfirmOpenChange,
  onDeleteConfirm,
  deleteLabel,
  retrySourceDocument,
  onRetryDialogOpenChange,
  ledgerId,
  candidateReviewDocument,
  onCandidateReviewOpenChange,
  mainCurrency,
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

      {retrySourceDocument && (
        <SourceDocumentEditRetryDialog
          sourceDocument={retrySourceDocument}
          open={true}
          onOpenChange={onRetryDialogOpenChange}
          ledgerId={ledgerId}
        />
      )}

      {candidateReviewDocument != null && (
        <SourceDocumentCandidateReviewDialog
          ledgerId={ledgerId}
          sourceDocumentId={candidateReviewDocument.id}
          open={true}
          onOpenChange={onCandidateReviewOpenChange}
          mainCurrency={mainCurrency}
        />
      )}
    </>
  );
}
