import { withLedgerAccess } from "../access";
import { serverComposition } from "@/application/server-composition-root";
import { listLedgerEntries } from "../application/queries/list-ledger-entries";

export const getLedgerEntriesAction = withLedgerAccess(
  (ledgerId: string, params: Parameters<typeof listLedgerEntries>[1]) =>
    listLedgerEntries(ledgerId, params, serverComposition.ledgerReads)
);
