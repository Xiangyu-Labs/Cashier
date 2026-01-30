import { BaseRepository } from "./base-repository";
import { ledgerEntries } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

class LedgerEntryRepository extends BaseRepository<LedgerEntry, typeof ledgerEntries> {
    constructor() {
        super(ledgerEntries, 'ledger_entry');
    }

    // Add specific methods here if needed (e.g. updateStatus)
    async confirmAllPending(ledgerId: string) {
        const { and, eq, sql } = await import("drizzle-orm");

        // Confirm all entries by clearing anomaly codes
        // We target entries where anomaly_codes is not empty/null
        const results = await this.db.update(this.table)
            .set({ anomalyCodes: [] })
            .where(and(
                eq(this.table.ledgerId, ledgerId),
                sql`jsonb_array_length(${this.table.anomalyCodes}) > 0`
            ))
            .returning();

        if (results.length > 0) {
            const { eventBus } = await import("@/lib/events/event-bus");
            eventBus.publish({
                type: 'entity:changed',
                ledgerId,
                entity: this.entityType,
                action: 'updated',
                ids: results.map(r => r.id)
            });
        }
        return results;
    }
}

export const ledgerEntryRepo = new LedgerEntryRepository();
