import { QueryClient, QueryObserver, type Query } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  invalidateLedgerMutationResources,
  ledgerMutationResourcePredicates,
} from "@/lib/mutations/ledger-mutation-resources";

function matches(
  group: Parameters<typeof ledgerMutationResourcePredicates>[1],
  queryKey: readonly unknown[]
) {
  const [predicate] = ledgerMutationResourcePredicates("ledger-1", group);
  return predicate?.({ queryKey } as Query) ?? false;
}

describe("ledger mutation resource groups", () => {
  it("targets document views and derived ledger resources", () => {
    expect(matches(["documents"], queryKeys.sourceDocumentStream("ledger-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.sourceDocument("ledger-1", "doc-1"))).toBe(true);
    expect(
      matches(["documents"], queryKeys.sourceDocumentCandidateReview("ledger-1", "doc-1"))
    ).toBe(true);
    expect(
      matches(["documents"], queryKeys.sourceDocumentDuplicateReview("ledger-1", "doc-1"))
    ).toBe(true);
    expect(matches(["documents"], queryKeys.sourceDocumentRefresh("ledger-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.sourceDocumentStream("ledger-2"))).toBe(false);
    expect(matches(["documents"], queryKeys.sourceDocumentRefresh("ledger-2"))).toBe(false);
    expect(matches(["entries"], queryKeys.sourceDocumentRefresh("ledger-1"))).toBe(false);
  });

  it("refetches an active refresh observer after a document mutation", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const queryKey = queryKeys.sourceDocumentRefresh("ledger-1");
    const queryFn = vi.fn().mockResolvedValue({ version: "1" });
    await queryClient.fetchQuery({ queryKey, queryFn });
    const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);

    try {
      await invalidateLedgerMutationResources(queryClient, "ledger-1", ["documents"]);
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });

  it("targets entry lists and individual entry details by ledger", () => {
    expect(matches(["entries"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.ledgerEntry("ledger-2", "entry-1"))).toBe(false);
  });

  it("targets category, settings, and credential resources by ledger", () => {
    expect(matches(["categories"], queryKeys.entryCategories("ledger-1"))).toBe(true);
    expect(matches(["categories"], queryKeys.ledgerSettings("ledger-1"))).toBe(true);
    expect(matches(["categories"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["categories"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.entryCategories("ledger-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.ledgerSettings("ledger-1"))).toBe(true);
    expect(matches(["settings"], queryKeys.ledgerSettings("ledger-1"))).toBe(true);
    expect(matches(["settings"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["settings"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["settings"], queryKeys.ledgerEntries("ledger-2"))).toBe(false);
    expect(matches(["credentials"], queryKeys.ledgerSettings("ledger-1"))).toBe(true);
    expect(matches(["credentials"], queryKeys.ledgerSettings("ledger-2"))).toBe(false);
  });

  it("returns no predicate when no resource group is requested", () => {
    expect(ledgerMutationResourcePredicates("ledger-1", [])).toEqual([]);
  });
});
