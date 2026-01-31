import { BaseRepository, QueryOptions } from "@/lib/repositories/base-repository";
import { ledgerEntryRepo } from "@/lib/repositories/ledger-entry-repository";
import { sourceDocumentRepo } from "@/lib/repositories/source-document-repository";
import { taskRunRepo } from "@/lib/repositories/task-run-repository";
import { shareRepo } from "@/lib/repositories/share-repository";
import { entryCategoryRepo } from "@/lib/repositories/entry-category-repository";
import { PgTable } from "drizzle-orm/pg-core";
import { InferInsertModel } from "drizzle-orm";

/**
 * A scoped wrapper around a repository that automatically applies the ledgerId to all operations.
 * This ensures that data access is always strictly scoped to the current ledger context.
 */
export class ScopedRepository<T extends { id: string }, U extends PgTable> {
    constructor(
        private repo: BaseRepository<T, U>,
        private ledgerId: string
    ) { }

    /**
     * Get a record by ID, enforcing strict ledger ownership.
     */
    async get(id: string): Promise<T | null> {
        return this.repo.getById(id, this.ledgerId);
    }

    /**
     * Find multiple records matching the query conditions.
     * The ledgerId is automatically injected to ensure tenant isolation.
     */
    async findMany(options: QueryOptions<T> = {}): Promise<T[]> {
        return this.repo.findMany(this.ledgerId, options);
    }

    /**
     * Find the first record matching the query conditions.
     * The ledgerId is automatically injected to ensure tenant isolation.
     */
    async findFirst(options: QueryOptions<T> = {}): Promise<T | null> {
        return this.repo.findFirst(this.ledgerId, options);
    }

    /**
     * Count records matching the query conditions.
     * The ledgerId is automatically injected to ensure tenant isolation.
     */
    async count(options: Pick<QueryOptions<T>, 'where'> = {}): Promise<number> {
        return this.repo.count(this.ledgerId, options);
    }

    /**
     * Update a record by ID, enforcing strict ledger ownership.
     */
    async update(id: string, data: Partial<T>): Promise<T> {
        return this.repo.update(id, data, this.ledgerId);
    }

    /**
     * Delete a record by ID, enforcing strict ledger ownership.
     */
    async delete(id: string): Promise<void> {
        return this.repo.delete(id, this.ledgerId);
    }

    /**
     * Create a record, automatically injecting the ledgerId.
     */
    async create(data: Omit<InferInsertModel<U>, "ledgerId"> & { ledgerId?: string }): Promise<T> {
        // We cast to any to inject the ledgerId if it's missing from the type definition
        // typically the data model has ledgerId as required, but we want to allow omitting it in the call
        const dataWithLedger = {
            ...data,
            ledgerId: this.ledgerId
        } as InferInsertModel<U>;

        return this.repo.create(dataWithLedger, this.ledgerId);
    }

    /**
     * Batch create records, automatically injecting the ledgerId.
     */
    async batchCreate(data: (Omit<InferInsertModel<U>, "ledgerId"> & { ledgerId?: string })[]): Promise<T[]> {
        const dataWithLedger = data.map(d => ({
            ...d,
            ledgerId: this.ledgerId
        })) as InferInsertModel<U>[];

        return this.repo.batchCreate(dataWithLedger, this.ledgerId);
    }

    /**
     * Batch update records, enforcing strict ledger ownership.
     */
    async batchUpdate(ids: string[], data: Partial<T>): Promise<T[]> {
        return this.repo.batchUpdate(ids, data, this.ledgerId);
    }

    /**
     * Batch delete records, enforcing strict ledger ownership.
     */
    async batchDelete(ids: string[]): Promise<void> {
        return this.repo.batchDelete(ids, this.ledgerId);
    }

    /**
     * Delete multiple records matching the query conditions.
     * The ledgerId is automatically injected to ensure tenant isolation.
     */
    async deleteMany(options: Pick<QueryOptions<T>, 'where'>): Promise<void> {
        return this.repo.deleteMany(this.ledgerId, options);
    }
}

/**
 * The LedgerScope acts as a factory for scoped repositories.
 * It represents an authenticated context where a specific user is accessing a specific ledger.
 * This is the primary entry point for all data access in API routes.
 */
export class LedgerScope {
    constructor(private readonly ledgerId: string) {
        if (!ledgerId) {
            throw new Error("LedgerScope requires a valid ledgerId");
        }
    }

    get entries() {
        return new ScopedRepository(ledgerEntryRepo, this.ledgerId);
    }

    get documents() {
        return new ScopedRepository(sourceDocumentRepo, this.ledgerId);
    }

    get tasks() {
        return new ScopedRepository(taskRunRepo, this.ledgerId);
    }

    get shares() {
        return new ScopedRepository(shareRepo, this.ledgerId);
    }

    get categories() {
        return new ScopedRepository(entryCategoryRepo, this.ledgerId);
    }

    /**
     * Create a scope from a verified context object (e.g. from requireLedgerAccess)
     */
    static fromContext(context: { ledgerId: string }) {
        return new LedgerScope(context.ledgerId);
    }

    /**
     * Create a scope from a validated service credential
     * Used for API key based authentication (e.g., /api/v1 endpoints)
     */
    static fromCredential(credential: { ledgerId: string }) {
        return new LedgerScope(credential.ledgerId);
    }
}
