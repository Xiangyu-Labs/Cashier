import { db } from "@/lib/db";
import type { CategoryInfo } from "@/features/ai/types";
import type { Ledger } from "@/lib/db/schema";

interface SourceDocumentTaskSettings {
  aiLanguage: string;
  preferredCurrencies?: string[];
  settings: {
    aiCustomPrompt?: string;
  };
}

export interface SourceDocumentTaskContext {
  categories: CategoryInfo[];
  settings: SourceDocumentTaskSettings;
}

export async function getSourceDocumentTaskContext(
  ledgerId: string,
  ledger: Ledger
): Promise<SourceDocumentTaskContext> {
  const categories = await db.query.entryCategories.findMany({
    where: (table, { eq, or, isNull, and }) =>
      and(or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId)), isNull(table.deletedAt)),
    orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.id)],
  });

  const ledgerSettings = ledger.metadata?.settings ?? {};

  return {
    categories,
    settings: {
      aiLanguage: ledgerSettings.aiLanguage ?? "zh-CN",
      preferredCurrencies: ledgerSettings.currencies ?? undefined,
      settings: {
        aiCustomPrompt: ledgerSettings.aiCustomPrompt,
      },
    },
  };
}
