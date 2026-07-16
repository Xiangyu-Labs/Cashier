import { currentApplication } from "@/application/current";

export function createLedgerEntryWithConversion(input: {
  ledgerId: string;
  amount: number;
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
  amount?: number;
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
  amount?: number;
  description?: string | null;
  itemName?: string;
}) {
  return currentApplication.ledgerMutations.batchUpdateEntries(input);
}
