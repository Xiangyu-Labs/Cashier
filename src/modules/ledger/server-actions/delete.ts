"use server";

import { db } from "@/lib/db";
import { ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/persistence";
import { withAuth } from "@/lib/auth-actions";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { clearUserDefaultLedger } from "@/modules/auth";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Soft delete a ledger and all its related data (entries, categories, source documents)
 * 幂等删除：删除已软删除的账本时静默成功
 */
export const deleteLedgerAction = withAuth(
  async (userId: string, ledgerId: string): Promise<void> => {
    // Verify ownership - 查询包括已软删除的记录
    const existing = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });

    // 如果账本不存在，抛出错误（不是幂等情况）
    if (!existing) {
      throw new NotFoundError("Ledger");
    }

    // 先检查权限
    if (existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this ledger");
    }

    // 再检查幂等性：如果账本已软删除，静默成功
    if (existing.deletedAt != null) {
      return;
    }

    const qEntries = forLedger(ledgerEntries, ledgerId);
    const qCategories = forLedger(entryCategories, ledgerId);
    const qSourceDocs = forLedger(sourceDocuments, ledgerId);

    // Soft delete all related data in a transaction (sync for better-sqlite3)
    db.transaction((tx) => {
      // 1. Soft delete all ledger entries
      tx.update(ledgerEntries).set(qEntries.softDelete).where(qEntries.whereActive).run();

      // 2. Soft delete all entry categories
      tx.update(entryCategories).set(qCategories.softDelete).where(qCategories.whereActive).run();

      // 3. Soft delete all source documents
      tx.update(sourceDocuments).set(qSourceDocs.softDelete).where(qSourceDocs.whereActive).run();

      // 4. Soft delete the ledger itself
      tx.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, ledgerId)).run();
    });

    // Clear defaultLedgerId for users who had this ledger as default
    await clearUserDefaultLedger(ledgerId);

    // Invalidate cache
    updateTag("ledger");
  }
);
