"use server";
import { withLedgerAccess } from "../access";
import { exportLedgerEntries } from "@/modules/ledger/use-cases";
import type { ExportLedgerEntriesOptions, ExportResult } from "@/modules/ledger/contracts";

export const exportLedgerEntriesAction = withLedgerAccess(
  async (
    ledgerId: string,
    locale: string = "en",
    options?: ExportLedgerEntriesOptions
  ): Promise<ExportResult> => exportLedgerEntries(ledgerId, locale, options)
);
