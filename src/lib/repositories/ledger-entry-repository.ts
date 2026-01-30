import { BaseRepository } from "./base-repository";
import { ledgerEntries } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

class LedgerEntryRepository extends BaseRepository<LedgerEntry, typeof ledgerEntries> {
    constructor() {
        super(ledgerEntries, 'ledger_entry');
    }

    // Note: confirmAllPending removed - no longer tracking anomaly states on entries
}

export const ledgerEntryRepo = new LedgerEntryRepository();
