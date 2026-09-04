"use client";
import { deleteSourceDocumentAction } from "@/modules/source-document/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import { unwrapVersionedCommandResult } from "@/modules/source-document/command-results";
import type { DeleteSourceDocumentResultDto } from "@/modules/source-document/contracts";

interface UseSourceDocumentRecordMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  version: number;
  onClose: () => void;
}

export function useSourceDocumentRecordMutations({
  id,
  ledgerId,
  version,
  onClose,
}: UseSourceDocumentRecordMutationsOptions) {
  const tCommon = useTranslations("Common");

  // -----------------------------------------------------------------------
  // Delete source document
  // -----------------------------------------------------------------------

  const deleteDocumentMutation = useLedgerMutation<DeleteSourceDocumentResultDto, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const result = await deleteSourceDocumentAction(ledgerId, id, version);
      return unwrapVersionedCommandResult(result);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: () => {
      onClose();
    },
  });

  return {
    deleteDocumentMutation,
  };
}
