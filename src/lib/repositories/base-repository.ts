import { db } from "@/lib/db";
import { eventBus } from "@/lib/events/event-bus";
import { EntityType } from "@/lib/events/types";
import { PgTable } from "drizzle-orm/pg-core";
import { eq, inArray } from "drizzle-orm";

type DbClient = typeof db;

export abstract class BaseRepository<T extends { id: string }, U extends PgTable> {
    constructor(
        protected readonly table: U,
        protected readonly entityType: EntityType,
        protected readonly ledgerIdField: string = "ledgerId"
    ) { }

    protected get db(): DbClient {
        return db;
    }

    /**
     * Insert a record and publish 'created' event
     */
    async create(data: T extends any ? any : never, ledgerId?: string): Promise<T> {
        const [result] = await this.db.insert(this.table).values(data).returning();

        // Resolve ledgerId from data or argument
        const resolvedLedgerId = ledgerId || (result as any)[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'created',
                ids: [(result as any).id as string]
            });
        }

        return result as T;
    }

    /**
     * Batch insert records and publish 'created' event
     */
    async batchCreate(data: (T extends any ? any : never)[], ledgerId?: string): Promise<T[]> {
        if (data.length === 0) return [];

        const results = await this.db.insert(this.table).values(data).returning();

        // Assume all belong to the same ledger if batch inserted, or pick from first
        const resolvedLedgerId = ledgerId || (results[0] as any)[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'created',
                ids: results.map(r => (r as any).id as string)
            });
        }

        return results as T[];
    }

    /**
     * Update a record and publish 'updated' event
     */
    async update(id: string, data: Partial<T>, ledgerId?: string): Promise<T> {
        // We assume 'id' column exists and is the primary key

        const [result] = await this.db.update(this.table)
            .set(data)
            .where(eq((this.table as any).id, id))
            .returning();

        if (!result) throw new Error(`Entity ${this.entityType} with id ${id} not found`);

        const resolvedLedgerId = ledgerId || (result as any)[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'updated',
                ids: [id]
            });
        }

        return result as T;
    }

    /**
     * Update multiple records by IDs and publish 'updated' event
     */
    async batchUpdate(ids: string[], data: Partial<T>, ledgerId: string): Promise<T[]> {
        if (ids.length === 0) return [];

        const results = await this.db.update(this.table)
            .set(data)
            .where(inArray((this.table as any).id, ids))
            .returning();

        if (results.length > 0) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId, // Trust the passed ledgerId for batch ops to avoid checking every record
                entity: this.entityType,
                action: 'updated',
                ids: results.map(r => (r as any).id as string)
            });
        }

        return results as T[];
    }

    /**
     * Delete a record and publish 'deleted' event
     */
    async delete(id: string, ledgerId?: string): Promise<void> {
        const [deleted] = await this.db.delete(this.table)
            .where(eq((this.table as any).id, id))
            .returning();

        if (deleted) {
            const resolvedLedgerId = ledgerId || (deleted as any)[this.ledgerIdField] as string;
            if (resolvedLedgerId) {
                eventBus.publish({
                    type: 'entity:changed',
                    ledgerId: resolvedLedgerId,
                    entity: this.entityType,
                    action: 'deleted',
                    ids: [id]
                });
            }
        }
    }

    async batchDelete(ids: string[], ledgerId?: string): Promise<void> {
        if (ids.length === 0) return;

        // Optionally enforce ledgerId check if we can.
        // For simplicity in BaseRepository, we delete by ID.
        // Use generic casting for now.
        const deleted = await this.db.delete(this.table)
            .where(inArray((this.table as any).id, ids))
            .returning();

        if (deleted.length > 0) {
            const resolvedLedgerId = ledgerId || (deleted[0] as any)[this.ledgerIdField] as string;
            if (resolvedLedgerId) {
                eventBus.publish({
                    type: 'entity:changed',
                    ledgerId: resolvedLedgerId,
                    entity: this.entityType,
                    action: 'deleted',
                    ids: deleted.map(d => (d as any).id as string)
                });
            }
        }
    }
}
