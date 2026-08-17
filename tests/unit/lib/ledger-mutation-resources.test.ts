import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { ledgerMutationResourcePredicates } from "@/lib/mutations/ledger-mutation-resources";

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
    expect(matches(["documents"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["documents"], queryKeys.sourceDocumentStream("ledger-2"))).toBe(false);
  });

  it("targets entry lists and individual entry details by ledger", () => {
    expect(matches(["entries"], queryKeys.ledgerEntries("ledger-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.ledgerEntry("ledger-1", "entry-1"))).toBe(true);
    expect(matches(["entries"], queryKeys.ledgerEntry("ledger-2", "entry-1"))).toBe(false);
  });

  it("targets category, settings, and credential resources by ledger", () => {
    expect(matches(["categories"], queryKeys.entryCategories("ledger-1"))).toBe(true);
    expect(matches(["categories"], queryKeys.ledgerSettings("ledger-1"))).toBe(true);
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
