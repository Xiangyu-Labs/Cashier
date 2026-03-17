import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { SQLiteTable, SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Interface for tables that have ledgerId and optional deletedAt columns
 * This allows type-safe access to these columns without 'as unknown as' casts
 */
interface LedgerScopedTable {
  ledgerId: SQLiteColumn;
  deletedAt?: SQLiteColumn;
  id: SQLiteColumn;
}

/**
 * 为指定 ledgerId 创建作用域查询条件
 * 自动添加租户隔离 + 软删除过滤
 */
export function forLedger<T extends SQLiteTable>(table: T & LedgerScopedTable, ledgerId: string) {
  return {
    /**
     * 生成标准的 WHERE 条件 (租户隔离 + 软删除)
     * - automatically checks ledgerId
     * - automatically checks deletedAt is null (if exists)
     */
    get whereActive() {
      const conditions: SQL[] = [eq(table.ledgerId, ledgerId)];

      // Check if table has soft delete column
      if (table.deletedAt) {
        conditions.push(isNull(table.deletedAt));
      }

      return and(...conditions);
    },

    /**
     * 生成精确匹配条件 (用于 update/delete by ID)
     * - automatically ensures the entity belongs to the ledger and is active
     */
    whereId(id: string) {
      return and(eq(table.id, id), this.whereActive);
    },

    /**
     * 软删除数据
     * Use in db.update().set(...)
     */
    get softDelete() {
      return { deletedAt: new Date() } as const;
    },

    /**
     * 当前 ledgerId (用于 insert)
     */
    ledgerId,
  };
}
