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
const SourceDocumentCandidateReviewDialog = dynamic(
  () => loadCandidateReviewDialog().then((module) => module.SourceDocumentCandidateReviewDialog),
  { ssr: false }
);
const SourceDocumentDuplicateReviewDialog = dynamic(
  () => loadDuplicateReviewDialog().then((module) => module.SourceDocumentDuplicateReviewDialog),
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
  candidateReviewDocument: SourceDocument | null;
  onCandidateReviewOpenChange: (open: boolean) => void;
  duplicateReviewDocument: SourceDocument | null;
  onDuplicateReviewOpenChange: (open: boolean) => void;
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
  duplicateReviewDocument,
  onDuplicateReviewOpenChange,
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

      {duplicateReviewDocument != null && (
        <SourceDocumentDuplicateReviewDialog
          ledgerId={ledgerId}
          sourceDocumentId={duplicateReviewDocument.id}
          open={true}
          onOpenChange={onDuplicateReviewOpenChange}
          mainCurrency={mainCurrency}
        />
      )}
    </>
  );
}
