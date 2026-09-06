"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SourceDocument } from "@/modules/source-document/contracts";
import type { LedgerEntriesDeleteConfirmState } from "./useLedgerEntriesTabState";
import dynamic from "next/dynamic";

const loadEditRetryDialog = () =>
  import("@/modules/source-document/ui/SourceDocumentEditRetryDialog");
const loadCandidateReviewDialog = () =>
  import("@/modules/source-document/ui/SourceDocumentCandidateReviewDialog");
const loadDuplicateReviewDialog = () =>
  import("@/modules/source-document/ui/SourceDocumentDuplicateReviewDialog");

const SourceDocumentEditRetryDialog = dynamic(
  () => loadEditRetryDialog().then((module) => module.SourceDocumentEditRetryDialog),
  { ssr: false }
);

export function preloadEditRetryDialog() {
  void loadEditRetryDialog();
}

export function preloadCandidateReviewDialog() {
  void loadCandidateReviewDialog();
}

export function preloadDuplicateReviewDialog() {
  void loadDuplicateReviewDialog();
}

interface LedgerEntriesOverlaysProps {
  deleteConfirm: LedgerEntriesDeleteConfirmState;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  deleteLabel: string;
  retrySourceDocument: SourceDocument | null;
  onRetryDialogOpenChange: (open: boolean) => void;
  ledgerId: string;
}

export function LedgerEntriesOverlays({
  deleteConfirm,
  onDeleteConfirmOpenChange,
  onDeleteConfirm,
  deleteLabel,
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
