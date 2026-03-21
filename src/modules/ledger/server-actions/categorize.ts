"use server";
import { withLedgerAccess } from "../access";
import {
  submitAutoCategorize,
  submitBatchCategorize,
} from "@/modules/ledger/application/use-cases/submit-categorize-tasks";
import type { CategorizeResult } from "@/modules/ledger/contracts";

export type { CategorizeResult } from "@/modules/ledger/contracts";

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
