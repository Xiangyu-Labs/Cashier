import { BaseRepository } from "@/lib/repositories/base-repository";
import { ledgerEntries, entryCategories } from "@/features/ledger/server/schema";
import { InferSelectModel } from "drizzle-orm";

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;
export type EntryCategory = InferSelectModel<typeof entryCategories>;

class LedgerEntryRepository extends BaseRepository<LedgerEntry, typeof ledgerEntries> {
    constructor() {
        super(ledgerEntries, 'ledger_entry', 'ledgerId', 'ledgerEntries');
    }
}

class EntryCategoryRepository extends BaseRepository<EntryCategory, typeof entryCategories> {
    constructor() {
        super(entryCategories, 'category', "ledgerId", "entryCategories");
    }
}

export const ledgerEntryRepo = new LedgerEntryRepository();
export const entryCategoryRepo = new EntryCategoryRepository();
