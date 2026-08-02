import type { LedgerMutationPort } from "../ports";

export function deleteLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string,
  mutations: LedgerMutationPort
) {
  return mutations.deleteEntry(ledgerId, ledgerEntryId);
}
