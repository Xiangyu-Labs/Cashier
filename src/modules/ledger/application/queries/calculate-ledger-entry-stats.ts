import { currentApplication } from "@/application/current";
import type { LedgerEntryFilterParams } from "./list-ledger-entry-page";

export function calculateLedgerEntryStats(input: {
  ledgerId: string;
  filters: LedgerEntryFilterParams;
  mainCurrency?: string;
}) {
  return currentApplication.ledgerReads.calculateStats(input);
}
