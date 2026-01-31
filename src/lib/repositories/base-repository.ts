import { db } from "@/lib/db";
import { eventBus } from "@/lib/events/event-bus";
import { EntityType } from "@/lib/events/types";
import { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { eq, inArray, and, InferInsertModel, SQL } from "drizzle-orm";

type DbClient = typeof db;

/**
 * Query options for findMany and findFirst methods
 */
export interface QueryOptions<T> {
    where?: SQL<unknown>;
    orderBy?: SQL<unknown> | SQL<unknown>[];
    limit?: number;
    offset?: number;
}

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
     * Get a record by ID, enforcing ledger ownership
     * @param id - The record ID
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async getById(id: string, ledgerId: string): Promise<T | null> {
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        const conditions = [
            eq(tableWithId.id, id),
            eq(tableWithLedgerId[this.ledgerIdField], ledgerId)
        ];

        const [result] = await this.db.select().from(this.table).where(and(...conditions));
        return (result as T) || null;
    }

    /**
     * Find multiple records matching the query conditions
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     * @param options - Query options (where, orderBy, limit, offset)
     */
    async findMany(ledgerId: string, options: QueryOptions<T> = {}): Promise<T[]> {
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        // Start with ledger isolation condition
        const conditions: SQL<unknown>[] = [eq(tableWithLedgerId[this.ledgerIdField], ledgerId)];

        // Add additional where conditions if provided
        if (options.where) {
            conditions.push(options.where);
        }

        let query = this.db.select().from(this.table).where(and(...conditions));

        // Apply ordering if provided
        if (options.orderBy) {
            const orderByArray = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
            query = query.orderBy(...orderByArray) as typeof query;
        }

        // Apply limit if provided
        if (options.limit !== undefined) {
            query = query.limit(options.limit) as typeof query;
        }

        // Apply offset if provided
        if (options.offset !== undefined) {
            query = query.offset(options.offset) as typeof query;
        }

        const results = await query;
        return results as T[];
    }

    /**
     * Find the first record matching the query conditions
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     * @param options - Query options (where, orderBy)
     */
    async findFirst(ledgerId: string, options: QueryOptions<T> = {}): Promise<T | null> {
        const results = await this.findMany(ledgerId, { ...options, limit: 1 });
        return results[0] || null;
    }

    /**
     * Count records matching the query conditions
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     * @param options - Query options (where)
     */
    async count(ledgerId: string, options: Pick<QueryOptions<T>, 'where'> = {}): Promise<number> {
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        // Start with ledger isolation condition
        const conditions: SQL<unknown>[] = [eq(tableWithLedgerId[this.ledgerIdField], ledgerId)];

        // Add additional where conditions if provided
        if (options.where) {
            conditions.push(options.where);
        }

        const results = await this.db.select().from(this.table).where(and(...conditions));
        return results.length;
    }

    /**
     * Insert a record and publish 'created' event
     * @param data - The data to insert
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async create(data: InferInsertModel<U>, ledgerId: string): Promise<T> {
        const [result] = await this.db.insert(this.table).values(data).returning();
        if (!result) throw new Error(`Failed to create entity ${this.entityType}`);
        const typedResult = result as T;

        eventBus.publish({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: this.entityType,
            action: 'created',
            ids: [typedResult.id]
        });

        return typedResult;
    }

    /**
     * Batch insert records and publish 'created' event
     * @param data - Array of data to insert
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async batchCreate(data: InferInsertModel<U>[], ledgerId: string): Promise<T[]> {
        if (data.length === 0) return [];

        const results = await this.db.insert(this.table).values(data).returning();
        const typedResults = results as T[];

        eventBus.publish({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: this.entityType,
            action: 'created',
            ids: typedResults.map(r => r.id)
        });

        return typedResults;
    }

    /**
     * Update a record and publish 'updated' event
     * @param id - The record ID
     * @param data - The data to update
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async update(id: string, data: Partial<T>, ledgerId: string): Promise<T> {
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        const conditions = [
            eq(tableWithId.id, id),
            eq(tableWithLedgerId[this.ledgerIdField], ledgerId)
        ];

        const [result] = await this.db.update(this.table)
            .set(data as unknown as Record<string, unknown>)
            .where(and(...conditions))
            .returning();

        if (!result) throw new Error(`Entity ${this.entityType} with id ${id} not found or access denied`);

        const typedResult = result as T;

        eventBus.publish({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: this.entityType,
            action: 'updated',
            ids: [id]
        });

        return typedResult;
    }

    /**
     * Update multiple records by IDs and publish 'updated' event
     * @param ids - Array of record IDs to update
     * @param data - The data to update
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async batchUpdate(ids: string[], data: Partial<T>, ledgerId: string): Promise<T[]> {
        if (ids.length === 0) return [];

        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        const conditions = [
            inArray(tableWithId.id, ids),
            eq(tableWithLedgerId[this.ledgerIdField], ledgerId)
        ];

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
     * @param id - The record ID
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async delete(id: string, ledgerId: string): Promise<void> {
        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        const conditions = [
            eq(tableWithId.id, id),
            eq(tableWithLedgerId[this.ledgerIdField], ledgerId)
        ];

        const [deleted] = await this.db.delete(this.table)
            .where(and(...conditions))
            .returning();

        if (deleted) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId,
                entity: this.entityType,
                action: 'deleted',
                ids: [id]
            });
        }
    }

    /**
     * Batch delete records and publish 'deleted' event
     * @param ids - Array of record IDs to delete
     * @param ledgerId - The ledger ID (REQUIRED for tenant isolation)
     */
    async batchDelete(ids: string[], ledgerId: string): Promise<void> {
        if (ids.length === 0) return;

        const tableWithId = this.table as unknown as PgTable & { id: PgColumn };
        const tableWithLedgerId = this.table as unknown as Record<string, PgColumn>;

        const conditions = [
            inArray(tableWithId.id, ids),
            eq(tableWithLedgerId[this.ledgerIdField], ledgerId)
        ];

        const deleted = await this.db.delete(this.table)
            .where(and(...conditions))
            .returning();

        if (deleted.length > 0) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId,
                entity: this.entityType,
                action: 'deleted',
                ids: (deleted as T[]).map(d => d.id)
            });
        }
    }
}
