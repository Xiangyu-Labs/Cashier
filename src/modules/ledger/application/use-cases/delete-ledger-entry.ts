import type { LedgerMutationPort } from "../ports";

export function deleteLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string,
  mutations: Pick<LedgerMutationPort, "deleteEntry">
) {
  return mutations.deleteEntry(ledgerId, ledgerEntryId);
}
