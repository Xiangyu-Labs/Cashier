"use server";
import { withLedgerAccess } from "../access";
import type { LedgerSettingsViewDto } from "@/modules/ledger/contracts";
import { getLedgerSettingsView } from "@/modules/ledger/queries";

/**
 * Batch fetch settings data in a single server action.
 * Returns uncategorizedCount and credentials only.
 * Categories are fetched separately via getEntryCategoriesAction to ensure
 * optimistic updates work correctly (shared query key with useCategoryMutations).
 */
export const getLedgerSettingsAction = withLedgerAccess(
  async (ledgerId: string): Promise<LedgerSettingsViewDto> => getLedgerSettingsView(ledgerId)
);
