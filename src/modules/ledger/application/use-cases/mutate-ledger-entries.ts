import type { LedgerMutationPort } from "../ports";
import type { CategoryPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";

type LedgerEntryMutationDependencies =
  | LedgerMutationPort
  | {
      mutations: LedgerMutationPort;
      categories: Pick<CategoryPort, "get">;
    };

function resolveDependencies(dependencies: LedgerEntryMutationDependencies): {
  mutations: LedgerMutationPort;
  categories?: Pick<CategoryPort, "get">;
} {
  if ("mutations" in dependencies) return dependencies;
  return { mutations: dependencies };
}

async function assertCategoryBelongsToLedger(
  ledgerId: string,
  categoryId: string | null | undefined,
  categories: Pick<CategoryPort, "get"> | undefined
): Promise<void> {
  if (categoryId == null || categories == null) return;
  if ((await categories.get(ledgerId, categoryId)) == null) {
    throw new NotFoundError("Category");
  }
}

export async function createLedgerEntryWithConversion(
  input: {
    ledgerId: string;
    amount: string;
    currency?: string;
    itemName: string;
    categoryId?: string;
    description?: string | null;
    sourceDocumentId: string;
  },
  dependencies: LedgerEntryMutationDependencies
) {
  const { mutations, categories } = resolveDependencies(dependencies);
  await assertCategoryBelongsToLedger(input.ledgerId, input.categoryId, categories);
  return mutations.createEntry(input);
}

export async function updateLedgerEntryWithConversion(
  input: {
    ledgerId: string;
    ledgerEntryId: string;
    categoryId?: string | null;
    amount?: string;
    currency?: string | null;
    itemName?: string;
    description?: string | null;
  },
  dependencies: LedgerEntryMutationDependencies
) {
  const { mutations, categories } = resolveDependencies(dependencies);
  await assertCategoryBelongsToLedger(input.ledgerId, input.categoryId, categories);
  return mutations.updateEntry(input);
}

export async function batchUpdateLedgerEntries(
  input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    categoryId?: string | null;
    currency?: string | null;
    amount?: string;
    description?: string | null;
    itemName?: string;
  },
  dependencies: LedgerEntryMutationDependencies
) {
  const { mutations, categories } = resolveDependencies(dependencies);
  await assertCategoryBelongsToLedger(input.ledgerId, input.categoryId, categories);
  return mutations.batchUpdateEntries(input);
}
