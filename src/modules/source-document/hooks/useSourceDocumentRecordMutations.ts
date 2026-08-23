"use client";
import {
  deleteSourceDocumentAction,
  updateSourceDocumentAction,
} from "@/modules/source-document/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";

interface UseSourceDocumentRecordMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
}

export function useSourceDocumentRecordMutations({
  id,
  ledgerId,
  onClose,
}: UseSourceDocumentRecordMutationsOptions) {
  const tCommon = useTranslations("Common");

  const updateSourceDocMutation = useLedgerMutation<
    Awaited<ReturnType<typeof updateSourceDocumentAction>>,
    { data: { title?: string; entryDate?: string }; operationId: string }
  >(ledgerId, {
    mutationFn: async ({
      data,
      operationId,
    }: {
      data: { title?: string; entryDate?: string };
      operationId: string;
    }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return updateSourceDocumentAction(ledgerId, id, data, operationId);
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["documents"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  // -----------------------------------------------------------------------
  // Delete source document
  // -----------------------------------------------------------------------

  const deleteDocumentMutation = useLedgerMutation<
    Awaited<ReturnType<typeof deleteSourceDocumentAction>>,
    { operationId: string }
  >(ledgerId, {
    mutationFn: async ({ operationId }: { operationId: string }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    resourceGroups: ["documents"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: () => {
      onClose();
    },
  });

  return {
    updateSourceDocMutation,
    deleteDocumentMutation,
  };
}
