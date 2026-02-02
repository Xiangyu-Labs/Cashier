import { and, eq, isNull, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

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
        get whereActive() {
            const t = table as unknown as PgTable & { ledgerId: unknown; deletedAt?: unknown };
            const conditions: SQL<unknown>[] = [eq(t.ledgerId as any, ledgerId)];

            // Drizzle table columns are available as properties on the table object
            if (t.deletedAt) {
                conditions.push(isNull(t.deletedAt as any));
            }

            return and(...conditions);
        },

        // Alias for convenience
        get active() {
            return this.whereActive;
        },

        /**
         * 生成精确匹配条件 (用于 update/delete by ID)
         * - automatically ensures the entity belongs to the ledger and is active
         */
        whereId(id: string) {
            return and(eq((table as unknown as PgTable & { id: unknown }).id as any, id), this.whereActive);
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
