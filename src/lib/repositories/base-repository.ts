import { db } from "@/lib/db";
import { eventBus } from "@/lib/events/event-bus";
import { EntityType } from "@/lib/events/types";
import { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { eq, inArray, and, InferInsertModel } from "drizzle-orm";

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
     * Get a record by ID, optionally enforcing ledger ownership
     */
    async getById(id: string, ledgerId?: string): Promise<T | null> {
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        const conditions = [eq(tableWithId.id, id)];
        if (ledgerId) {
             const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;
             conditions.push(eq(tableWithLedgerId[this.ledgerIdField], ledgerId));
        }

        const [result] = await this.db.select().from(this.table).where(and(...conditions));
        return (result as T) || null;
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

        const conditions = [eq(tableWithId.id, id)];
        if (ledgerId) {
            const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;
            conditions.push(eq(tableWithLedgerId[this.ledgerIdField], ledgerId));
        }

        const [result] = await this.db.update(this.table)
            .set(data as unknown as Record<string, unknown>)
            .where(and(...conditions))
            .returning();

        if (!result) throw new Error(`Entity ${this.entityType} with id ${id} not found or access denied`);

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

        const conditions = [inArray(tableWithId.id, ids)];
        // Enforce ledgerId for batch updates if provided
        // Logic: All items must belong to the ledger.
        // Note: The UPDATE statement will only affect rows that match the ledgerId.
        // If some IDs belong to other ledgers, they simply won't be updated.
        if (ledgerId) {
            const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;
            conditions.push(eq(tableWithLedgerId[this.ledgerIdField], ledgerId));
        }

        const results = await this.db.update(this.table)
            .set(data as unknown as Record<string, unknown>)
            .where(and(...conditions))
            .returning();

        if (results.length > 0) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId,
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

        const conditions = [eq(tableWithId.id, id)];
        if (ledgerId) {
            const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;
            conditions.push(eq(tableWithLedgerId[this.ledgerIdField], ledgerId));
        }

        const [deleted] = await this.db.delete(this.table)
            .where(and(...conditions))
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
        } else if (ledgerId) {
            // If we expected a deletion but nothing happened, it could be a security violation or just not found.
            // For now, we silently return as delete is often idempotent, but in strict mode we might want to know.
        }
    }

    async batchDelete(ids: string[], ledgerId?: string): Promise<void> {
        if (ids.length === 0) return;

        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };

        const conditions = [inArray(tableWithId.id, ids)];
        if (ledgerId) {
            const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;
            conditions.push(eq(tableWithLedgerId[this.ledgerIdField], ledgerId));
        }

        const deleted = await this.db.delete(this.table)
            .where(and(...conditions))
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
