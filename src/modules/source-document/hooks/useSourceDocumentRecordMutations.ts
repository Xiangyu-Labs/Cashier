"use client";
import { toast } from "sonner";
import { deleteSourceDocumentAction } from "@/modules/source-document/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import {
  requireSourceDocumentVersion,
  SourceDocumentStaleCommandError,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";

interface UseSourceDocumentRecordMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  /** Read fresh at submission time — never captured ahead of the actual click. */
  version: number | null;
  onClose: () => void;
}

export function useSourceDocumentRecordMutations({
  id,
  ledgerId,
  version,
  onClose,
}: UseSourceDocumentRecordMutationsOptions) {
  const tCommon = useTranslations("Common");
  const tDetail = useTranslations("SourceDocumentDetail");

  // -----------------------------------------------------------------------
  // Delete source document
  // -----------------------------------------------------------------------

  const deleteDocumentMutation = useLedgerMutation<DeleteSourceDocumentResultDto, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const expectedVersion = requireSourceDocumentVersion(version, id);
      const result = await deleteSourceDocumentAction(ledgerId, id, expectedVersion);
      return unwrapVersionedCommandResult(result);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onError: (error) => {
      toast.error(
        error instanceof SourceDocumentStaleCommandError
          ? tDetail("actionContextChanged")
          : tCommon("deleteFailed")
      );
    },
    onSuccess: () => {
      onClose();
    },
  });

  return {
    deleteDocumentMutation,
  };
}
