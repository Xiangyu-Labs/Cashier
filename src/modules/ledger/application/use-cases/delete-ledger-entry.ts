import { currentApplication } from "@/application/current";

export function deleteLedgerEntry(ledgerId: string, ledgerEntryId: string) {
  return currentApplication.ledgerMutations.deleteEntry(ledgerId, ledgerEntryId);
}
