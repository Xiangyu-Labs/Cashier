import { currentApplication } from "@/application/current";

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  uncategorizedOnly?: boolean;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
}

export function listLedgerEntryPage(input: {
  ledgerId: string;
  limit?: number;
  cursor?: string | null;
  filters: LedgerEntryFilterParams;
}) {
  return currentApplication.ledgerReads.listEntries(input);
}
