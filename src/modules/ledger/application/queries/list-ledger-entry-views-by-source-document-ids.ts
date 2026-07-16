import { currentApplication } from "@/application/current";

export function listLedgerEntryViewsBySourceDocumentIds(input: {
  ledgerId: string;
  sourceDocumentIds: string[];
}) {
  return currentApplication.ledgerReads.listEntriesBySourceDocumentIds(input);
}
