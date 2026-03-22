"use client";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import { useTaskQueueCancelMutations } from "./useTaskQueueCancelMutations";
import { useTaskQueueDeleteMutations } from "./useTaskQueueDeleteMutations";
import { useTaskQueueDismissMutations } from "./useTaskQueueDismissMutations";
import { useTaskQueueRetryMutations } from "./useTaskQueueRetryMutations";

export function useTaskQueueMutations(ledgerId: string) {
  const t = useTranslations("TaskQueue");
  const tCommon = useTranslations("Common");
  const tEntries = useTranslations("LedgerEntriesTab");
  const taskQueueKey = queryKeys.taskQueue(ledgerId);

  const deleteMutations = useTaskQueueDeleteMutations({
    ledgerId,
    taskQueueKey,
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
  });

  const retryMutations = useTaskQueueRetryMutations({
    ledgerId,
    taskQueueKey,
    successMessage: tEntries("retrySubmitted"),
    errorMessage: tCommon("error"),
  });

  const cancelMutations = useTaskQueueCancelMutations({
    ledgerId,
    taskQueueKey,
    successMessage: t("cancelled"),
    errorMessage: tCommon("error"),
  });

  const dismissMutations = useTaskQueueDismissMutations({
    ledgerId,
    taskQueueKey,
    successMessage: t("dismissed"),
    errorMessage: tCommon("error"),
  });

  return {
    ...deleteMutations,
    ...retryMutations,
    ...cancelMutations,
    ...dismissMutations,
  };
}
