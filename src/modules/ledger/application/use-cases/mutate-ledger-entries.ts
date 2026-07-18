import { currentApplication } from "@/application/current";

export function createLedgerEntryWithConversion(input: {
  ledgerId: string;
  amount: string;
  currency?: string;
  itemName: string;
  categoryId?: string;
  description?: string | null;
  sourceDocumentId: string;
}) {
  return currentApplication.ledgerMutations.createEntry(input);
}

export function updateLedgerEntryWithConversion(input: {
  ledgerId: string;
  ledgerEntryId: string;
  categoryId?: string | null;
  amount?: string;
  currency?: string | null;
  itemName?: string;
  description?: string | null;
}) {
  return currentApplication.ledgerMutations.updateEntry(input);
}

export function batchUpdateLedgerEntries(input: {
  ledgerId: string;
  ledgerEntryIds: string[];
  categoryId?: string | null;
  currency?: string | null;
  amount?: string;
  description?: string | null;
  itemName?: string;
}) {
  return currentApplication.ledgerMutations.batchUpdateEntries(input);
}
