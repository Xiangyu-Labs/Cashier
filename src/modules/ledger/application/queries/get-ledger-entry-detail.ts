import { currentApplication } from "@/application/current";

export function getLedgerEntryDetail(id: string, ledgerId: string) {
  return currentApplication.ledgerReads.getEntry(id, ledgerId);
}
