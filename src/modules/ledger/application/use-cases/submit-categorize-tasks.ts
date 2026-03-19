import { logger } from "@/lib/logger";
import { getLedgerAiLanguage } from "@/modules/ledger/application/queries/get-ledger-ai-language";
import { listIndexedCategoriesForCategorization } from "@/modules/ledger/application/queries/list-indexed-categories-for-categorization";
import {
  listSelectedEntriesForCategorization,
  listUncategorizedEntriesForCategorization,
} from "@/modules/ledger/application/queries/list-categorization-target-entries";
import {
  submitCategorizeTasksForEntries,
  type CategorizeResult,
} from "@/modules/ledger/application/services/categorize-task-submission";

export type { CategorizeResult } from "@/modules/ledger/application/services/categorize-task-submission";

export async function submitAutoCategorize(ledgerId: string): Promise<CategorizeResult> {
  const uncategorizedEntries = await listUncategorizedEntriesForCategorization(ledgerId);
  const [categories, aiLanguage] = await Promise.all([
    listIndexedCategoriesForCategorization(ledgerId),
    getLedgerAiLanguage(ledgerId),
  ]);

  const result = await submitCategorizeTasksForEntries({
    ledgerId,
    entries: uncategorizedEntries,
    categories,
    aiLanguage,
  });

  logger.info(
    {
      ledgerId,
      submittedCount: result.submittedCount,
      skippedCount: result.skippedCount,
      totalUncategorized: uncategorizedEntries.length,
    },
    "Auto-categorize tasks submitted"
  );

  return result;
}

export async function submitBatchCategorize(
  ledgerId: string,
  entryIds: string[]
): Promise<CategorizeResult> {
  if (entryIds.length === 0) {
    return { submittedCount: 0, skippedCount: 0 };
  }

  const selectedEntries = await listSelectedEntriesForCategorization(ledgerId, entryIds);
  const [categories, aiLanguage] = await Promise.all([
    listIndexedCategoriesForCategorization(ledgerId),
    getLedgerAiLanguage(ledgerId),
  ]);

  const result = await submitCategorizeTasksForEntries({
    ledgerId,
    entries: selectedEntries,
    categories,
    aiLanguage,
  });

  logger.info(
    {
      ledgerId,
      submittedCount: result.submittedCount,
      skippedCount: result.skippedCount,
      totalSelected: selectedEntries.length,
    },
    "Batch categorize tasks submitted"
  );

  return result;
}
