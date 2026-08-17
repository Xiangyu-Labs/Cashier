"use client";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createServiceCredentialAction,
  deleteServiceCredentialAction,
} from "@/modules/ledger/server-actions/credentials";
import type { CreatedServiceCredential } from "@/modules/ledger/contracts";

export function useCredentialMutations(ledgerId: string) {
  const t = useTranslations("Settings");
  const createCredential = useLedgerMutation<CreatedServiceCredential, string>(ledgerId, {
    mutationFn: (name) => createServiceCredentialAction(ledgerId, { name }),
    successMessage: t("credentialCreated"),
    errorMessage: t("createFailed"),
    resourceGroups: ["credentials"],
  });

  const deleteCredential = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (id) => deleteServiceCredentialAction(ledgerId, id),
    successMessage: t("credentialDeleted"),
    errorMessage: t("deleteFailed"),
    resourceGroups: ["credentials"],
  });

  return {
    createCredential,
    deleteCredential,
  };
}
