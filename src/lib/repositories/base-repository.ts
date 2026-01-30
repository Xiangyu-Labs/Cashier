import { db } from "@/lib/db";
import { eventBus } from "@/lib/events/event-bus";
import { EntityType } from "@/lib/events/types";
import { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { eq, inArray, InferInsertModel } from "drizzle-orm";

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
    async create(data: InferInsertModel<U>, ledgerId?: string): Promise<T> {
        const [result] = await this.db.insert(this.table).values(data).returning();
        if (!result) throw new Error(`Failed to create entity ${this.entityType}`);
        const typedResult = result as T;

        // Resolve ledgerId from data or argument
        const resolvedLedgerId = ledgerId || (typedResult as Record<string, unknown>)[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'created',
                ids: [typedResult.id]
            });
        }

        return typedResult;
    }

    /**
     * Batch insert records and publish 'created' event
     */
    async batchCreate(data: InferInsertModel<U>[], ledgerId?: string): Promise<T[]> {
        if (data.length === 0) return [];

        const results = await this.db.insert(this.table).values(data).returning();
        const typedResults = results as T[];

        // Assume all belong to the same ledger if batch inserted, or pick from first
        const firstResult = typedResults[0] as Record<string, unknown>;
        const resolvedLedgerId = ledgerId || firstResult[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'created',
                ids: typedResults.map(r => r.id)
            });
        }

        return typedResults;
    }

    /**
     * Update a record and publish 'updated' event
     */
    async update(id: string, data: Partial<T>, ledgerId?: string): Promise<T> {
        // We assume 'id' column exists and is the primary key
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        const [result] = await this.db.update(this.table)
            .set(data as unknown as Record<string, unknown>)
            .where(eq(tableWithId.id, id))
            .returning();

        if (!result) throw new Error(`Entity ${this.entityType} with id ${id} not found`);

        const typedResult = result as T;
        const resolvedLedgerId = ledgerId || (typedResult as Record<string, unknown>)[this.ledgerIdField] as string;

        if (resolvedLedgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: resolvedLedgerId,
                entity: this.entityType,
                action: 'updated',
                ids: [id]
            });
        }

        return typedResult;
    }

    /**
     * Update multiple records by IDs and publish 'updated' event
     */
    async batchUpdate(ids: string[], data: Partial<T>, ledgerId: string): Promise<T[]> {
        if (ids.length === 0) return [];

        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        const results = await this.db.update(this.table)
            .set(data as unknown as Record<string, unknown>)
            .where(inArray(tableWithId.id, ids))
            .returning();

        if (results.length > 0) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId, // Trust the passed ledgerId for batch ops to avoid checking every record
                entity: this.entityType,
                action: 'updated',
                ids: (results as T[]).map(r => r.id)
            });
        }

        return results as T[];
    }

    /**
     * Delete a record and publish 'deleted' event
     */
    async delete(id: string, ledgerId?: string): Promise<void> {
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        const [deleted] = await this.db.delete(this.table)
            .where(eq(tableWithId.id, id))
            .returning();

        if (deleted) {
            const typedDeleted = deleted as T;
            const resolvedLedgerId = ledgerId || (typedDeleted as Record<string, unknown>)[this.ledgerIdField] as string;
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

        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        // Optionally enforce ledgerId check if we can.
        // For simplicity in BaseRepository, we delete by ID.
        const deleted = await this.db.delete(this.table)
            .where(inArray(tableWithId.id, ids))
            .returning();

        if (deleted.length > 0) {
            const typedDeleted = deleted[0] as T;
            const resolvedLedgerId = ledgerId || (typedDeleted as Record<string, unknown>)[this.ledgerIdField] as string;
            if (resolvedLedgerId) {
                eventBus.publish({
                    type: 'entity:changed',
                    ledgerId: resolvedLedgerId,
                    entity: this.entityType,
                    action: 'deleted',
                    ids: (deleted as T[]).map(d => d.id)
                });
            }
        }
    }
}
