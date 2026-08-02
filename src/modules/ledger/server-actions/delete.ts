"use server";
import { withAuth } from "@/lib/auth-actions";
import { deleteLedger } from "@/modules/ledger/application/use-cases/delete-ledger";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Soft delete a ledger and all its related data (entries, categories, source documents)
 * 幂等删除：删除已软删除的账本时静默成功
 */
export const deleteLedgerAction = withAuth(
  async (userId: string, ledgerId: string): Promise<void> =>
    deleteLedger(userId, ledgerId, serverComposition.ledgers)
);
