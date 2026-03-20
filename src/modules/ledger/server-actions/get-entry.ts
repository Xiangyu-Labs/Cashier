"use server";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { getLedgerEntryDetail } from "@/modules/ledger/queries";

export async function getLedgerEntryAction(id: string): Promise<LedgerEntryDto | null> {
  return getLedgerEntryDetail(id);
}
