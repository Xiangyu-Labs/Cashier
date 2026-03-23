"use client";

import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { queryKeys } from "@/lib/query-keys";
import { submitAutoCategorizeAction } from "@/modules/ledger/actions";

interface AutoCategorizeResult {
  submittedCount: number;
  skippedCount: number;
}

export function useAutoCategorizeMutation(ledgerId: string) {
  const t = useTranslations("Settings");

  return useLedgerMutation<AutoCategorizeResult, void>(ledgerId, {
    mutationFn: async () => submitAutoCategorizeAction(ledgerId),
    successMessage: null,
    errorMessage: t("autoCategorizeError"),
    skipInvalidation: true,
    onSettledExtra: async (queryClient) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.uncategorizedCount(ledgerId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.taskQueue(ledgerId),
      });
    },
  });
}
