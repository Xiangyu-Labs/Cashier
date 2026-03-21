"use server";
import { withLedgerAccess } from "@/lib/auth-actions";
import {
  submitAutoCategorize,
  submitBatchCategorize,
  type CategorizeResult,
} from "@/modules/ledger/application/use-cases/submit-categorize-tasks";

export type { CategorizeResult } from "@/modules/ledger/application/use-cases/submit-categorize-tasks";

/**
 * Submit auto-categorization tasks for all uncategorized entries in a ledger.
 */
export const submitAutoCategorizeAction = withLedgerAccess(
  async (ledgerId: string): Promise<CategorizeResult> => {
    return submitAutoCategorize(ledgerId);
  }
);

/**
 * Submit categorization tasks for specified entries.
 */
export const submitBatchCategorizeAction = withLedgerAccess(
  async (ledgerId: string, entryIds: string[]): Promise<CategorizeResult> => {
    return submitBatchCategorize(ledgerId, entryIds);
  }
);
