import { BaseRepository } from "./base-repository";
import { ledgerEntries } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

class LedgerEntryRepository extends BaseRepository<LedgerEntry, typeof ledgerEntries> {
    constructor() {
        super(ledgerEntries, 'ledger_entry');
    }

    // Add specific methods here if needed (e.g. updateStatus)
    async updateStatus(id: string, status: "pending" | "confirmed", ledgerId?: string) {
        return this.update(id, { status }, ledgerId);
    }

    async confirmAllPending(ledgerId: string) {
        const { and, eq } = await import("drizzle-orm");
        const results = await this.db.update(this.table)
            .set({ status: "confirmed" })
            .where(and(eq(this.table.ledgerId, ledgerId), eq(this.table.status, "pending")))
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
