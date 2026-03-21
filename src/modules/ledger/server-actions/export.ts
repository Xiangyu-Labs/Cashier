"use server";
import { withLedgerAccess } from "@/lib/auth-actions";
import {
  exportLedgerEntries,
  type ExportLedgerEntriesOptions,
  type ExportResult,
} from "@/modules/ledger/use-cases";

export const exportLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    locale: string = "en",
    options?: ExportLedgerEntriesOptions
  ): Promise<ExportResult> => exportLedgerEntries(ledgerId, locale, options)
);
