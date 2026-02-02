import { and, eq, isNull, SQL } from "drizzle-orm";
import { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * 为指定 ledgerId 创建作用域查询条件
 * 自动添加租户隔离 + 软删除过滤
 */
export function forLedger<T extends PgTable>(table: T, ledgerId: string) {
    return {
        /**
         * 生成标准的 WHERE 条件 (租户隔离 + 软删除)
         * - automatically checks ledgerId
         * - automatically checks deletedAt is null (if exists)
         */
        whereActive: (() => {
            // Need to cast table to any or specific shape to access columns safely in generic context without strict type checks on T
            // Drizzle types are complex. 
            // We assume T has ledgerId and deletedAt if we use this.
            const t = table as any;
            const conditions: SQL<unknown>[] = [eq(t.ledgerId, ledgerId)];
            if (t.deletedAt) {
                conditions.push(isNull(t.deletedAt));
            }
            return and(...conditions);
        })(), // Wait, better to be a function or a value? 
        // If it's a value, it's computed once. But table is an object.
        // Actually, db.update(table).where(...) expects a SQL object.
        // So `whereActive` should be a getter or a property? 
        // Or method: `whereActive()` -> SQL.

        // Let's make them properties or 0-arg functions.
        get active() {
            const t = table as any;
            const conditions: SQL<unknown>[] = [eq(t.ledgerId, ledgerId)];
            if (t.deletedAt) {
                conditions.push(isNull(t.deletedAt));
            }
            return and(...conditions);
        },

        /**
         * 生成精确匹配条件 (用于 update/delete by ID)
         * - automatically ensures the entity belongs to the ledger
         */
        whereId: (id: string) => {
            const t = table as any;
            return and(eq(t.id, id), eq(t.ledgerId, ledgerId));
        },

        /**
         * 软删除数据
         * Use in db.update().set(...)
         */
        softDelete: { deletedAt: new Date() } as const,

        /**
         * 当前 ledgerId (用于 insert)
         */
        ledgerId,
    };
}

/**
 * 类型安全的软删除助手 (Standalone)
 */
export const SOFT_DELETE = { deletedAt: new Date() } as const;
