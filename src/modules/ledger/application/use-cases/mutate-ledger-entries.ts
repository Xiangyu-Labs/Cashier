import type { LedgerMutationPort } from "../ports";

export function createLedgerEntryWithConversion(
  input: {
    ledgerId: string;
    amount: string;
    currency?: string;
    itemName: string;
    categoryId?: string;
    description?: string | null;
    sourceDocumentId: string;
  },
  mutations: LedgerMutationPort
) {
  return mutations.createEntry(input);
}

export function updateLedgerEntryWithConversion(
  input: {
    ledgerId: string;
    ledgerEntryId: string;
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  },
  mutations: LedgerMutationPort
) {
  return mutations.updateEntry(input);
}

export function batchUpdateLedgerEntries(
  input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    categoryId?: string | null;
    currency?: string | null;
    amount?: string;
    description?: string | null;
    itemName?: string;
  },
  mutations: LedgerMutationPort
) {
  return mutations.batchUpdateEntries(input);
}
