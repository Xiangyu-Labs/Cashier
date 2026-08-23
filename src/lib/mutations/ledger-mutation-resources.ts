import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateCalendar,
  invalidateEntryCategories,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  matchExactQueryKey,
  queryKeys,
} from "@/lib/query-keys";

export type LedgerMutationResourceGroup =
  "documents" | "entries" | "categories" | "settings" | "credentials";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

function matchesSourceDocumentDetails(ledgerId: string): QueryPredicate {
  return ({ queryKey }) =>
    (queryKey[0] === "ledger" && queryKey[1] === ledgerId && queryKey[2] === "source-document") ||
    (queryKey[0] === "sourceDocument" && queryKey[2] === ledgerId);
}

function matchesLedgerEntryDetails(ledgerId: string): QueryPredicate {
  return ({ queryKey }) =>
    queryKey[0] === "ledger" && queryKey[1] === ledgerId && queryKey[2] === "entry";
}

export function ledgerMutationResourcePredicates(
  ledgerId: string,
  resourceGroups: readonly LedgerMutationResourceGroup[]
): QueryPredicate[] {
  const predicates: QueryPredicate[] = [];
  const groups = new Set(resourceGroups);
  const addSourceDocuments = () => {
    predicates.push(invalidateSourceDocuments(ledgerId), matchesSourceDocumentDetails(ledgerId));
  };
  const addLedgerEntries = () => {
    predicates.push(invalidateLedgerEntries(ledgerId), matchesLedgerEntryDetails(ledgerId));
  };
  const addStatsAndCalendar = () => {
    predicates.push(invalidateLedgerStats(ledgerId), invalidateCalendar(ledgerId));
  };
  const addCategories = () => {
    predicates.push(
      invalidateEntryCategories(ledgerId),
      matchExactQueryKey(queryKeys.ledgerSettings(ledgerId))
    );
  };

  if (groups.has("documents")) {
    addSourceDocuments();
    addLedgerEntries();
    addCategories();
    addStatsAndCalendar();
  }
  if (groups.has("entries")) {
    addLedgerEntries();
    addSourceDocuments();
    addCategories();
    addStatsAndCalendar();
  }
  if (groups.has("categories")) {
    addCategories();
    addLedgerEntries();
    addSourceDocuments();
    addStatsAndCalendar();
  }
  if (groups.has("settings")) {
    predicates.push(
      matchExactQueryKey(queryKeys.ledger(ledgerId)),
      matchExactQueryKey(queryKeys.ledgerSettings(ledgerId))
    );
    addLedgerEntries();
    addSourceDocuments();
    addStatsAndCalendar();
  }
  if (groups.has("credentials")) {
    predicates.push(matchExactQueryKey(queryKeys.ledgerSettings(ledgerId)));
  }

  if (predicates.length === 0) return [];
  return [
    (query) => {
      for (const predicate of predicates) {
        if (predicate(query)) return true;
      }
      return false;
    },
  ];
}

export async function invalidateLedgerMutationResources(
  queryClient: QueryClient,
  ledgerId: string,
  resourceGroups: readonly LedgerMutationResourceGroup[]
): Promise<void> {
  await Promise.all(
    ledgerMutationResourcePredicates(ledgerId, resourceGroups).map((predicate) =>
      queryClient.invalidateQueries({ predicate, refetchType: "active" })
    )
  );
}
