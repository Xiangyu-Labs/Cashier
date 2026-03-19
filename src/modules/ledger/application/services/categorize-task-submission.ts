import { submitFlowTask } from "@/lib/flow";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { omitUndefinedProperties } from "@/lib/validation";
import {
  TASK_TYPE_CATEGORIZE_ENTRY,
  type CategorizeEntryInput,
} from "@/modules/ledger/application/tasks/categorize-entry";
import type { IndexedCategory } from "@/modules/ledger/application/queries/list-indexed-categories-for-categorization";
import type {
  listSelectedEntriesForCategorization,
  listUncategorizedEntriesForCategorization,
} from "@/modules/ledger/application/queries/list-categorization-target-entries";

type CategorizationEntry =
  | Awaited<ReturnType<typeof listUncategorizedEntriesForCategorization>>[number]
  | Awaited<ReturnType<typeof listSelectedEntriesForCategorization>>[number];

export interface CategorizeResult {
  submittedCount: number;
  skippedCount: number;
}

function shouldSkipEntry(entry: CategorizationEntry): boolean {
  return entry.sourceDocument?.type === "manual";
}

function buildCategorizeTaskInput(
  ledgerId: string,
  entry: CategorizationEntry,
  categories: IndexedCategory[],
  aiLanguage: string
): CategorizeEntryInput {
  const sourceDocumentText = entry.sourceDocument?.text ?? undefined;
  const sourceDocumentImageUrls =
    entry.sourceDocument?.imageUrls != null && entry.sourceDocument.imageUrls.length > 0
      ? entry.sourceDocument.imageUrls
      : undefined;

  return {
    ledgerId,
    entryId: entry.id,
    itemName: entry.itemName,
    amount: entry.amount,
    currency: entry.currency ?? "CNY",
    description: entry.description,
    entryDate:
      entry.sourceDocument?.entryDate != null && entry.sourceDocument.entryDate !== ""
        ? entry.sourceDocument.entryDate
        : formatDateTimeForApi(new Date()),
    ...omitUndefinedProperties({
      sourceDocumentText,
      sourceDocumentImageUrls,
    }),
    categories,
    aiLanguage,
  };
}

export async function submitCategorizeTasksForEntries(params: {
  ledgerId: string;
  entries: CategorizationEntry[];
  categories: IndexedCategory[];
  aiLanguage: string;
}): Promise<CategorizeResult> {
  if (params.entries.length === 0) {
    return { submittedCount: 0, skippedCount: 0 };
  }

  let submittedCount = 0;
  let skippedCount = 0;

  for (const entry of params.entries) {
    if (shouldSkipEntry(entry)) {
      skippedCount++;
      continue;
    }

    const taskInput = buildCategorizeTaskInput(
      params.ledgerId,
      entry,
      params.categories,
      params.aiLanguage
    );

    await submitFlowTask(TASK_TYPE_CATEGORIZE_ENTRY, taskInput, {
      title: `Categorize: ${entry.itemName}`,
      scopeId: params.ledgerId,
      entityType: "entry",
      entityId: entry.id,
      deduplicationKey: `categorize:${params.ledgerId}:${entry.id}`,
    });
    submittedCount++;
  }

  return { submittedCount, skippedCount };
}
