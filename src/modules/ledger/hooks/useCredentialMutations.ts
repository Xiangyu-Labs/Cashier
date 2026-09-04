"use client";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
} from "@/modules/ledger/actions";
import type { CreatedServiceCredential } from "@/modules/ledger/contracts";
import { toast } from "sonner";

export function useCredentialMutations(ledgerId: string) {
  const t = useTranslations("Settings");
  const tCredentials = useTranslations("ServiceCredentials");
  const tCommon = useTranslations("Common");
  const createCredential = useLedgerMutation<CreatedServiceCredential, string>(ledgerId, {
    mutationFn: (name) => createServiceCredentialAction(ledgerId, { name }),
    successMessage: t("credentialCreated"),
    errorMessage: null,
    onError: (error) => {
      const code = (error as Error & { code?: unknown }).code;
      toast.error(code === "CONFLICT" ? tCredentials("maxActive") : t("createFailed"));
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteCredential = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
    successMessage: t("credentialDeleted"),
    errorMessage: t("deleteFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  return {
    createCredential,
    deleteCredential,
  };
}
