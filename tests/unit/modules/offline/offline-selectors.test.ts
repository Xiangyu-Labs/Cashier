import { describe, expect, it } from "vitest";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { selectOfflineDocuments, totalOfflineMatches } from "@/modules/offline/offline-selectors";

function entry(id: string, itemName: string, amount: string): SourceDocumentLedgerEntryDto {
  return {
    id,
    ledgerId: "ledger",
    categoryId: null,
    sourceDocumentId: "document",
    amount,
    currency: "CNY",
    itemName,
    description: null,
    convertedAmount: null,
    exchangeRate: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    deletedAt: null,
  };
}

function document(entries: SourceDocumentLedgerEntryDto[]): SourceDocumentListItemDto {
  return {
    id: "document",
    ledgerId: "ledger",
    title: "Afternoon tea",
    text: null,
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-30",
    metadata: {},
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    deletedAt: null,
    ledgerEntries: entries,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
  };
}

describe("offline filtering contract", () => {
  it("uses one matching entry for amount filters while retaining the complete document", () => {
    const original = document([entry("coffee", "Coffee", "20"), entry("cake", "Cake", "80")]);
    const matches = selectOfflineDocuments([original], { maxAmount: 30 });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchedEntries.map((item) => item.id)).toEqual(["coffee"]);
    expect(matches[0]?.subtotal).toBe("20");
    expect(totalOfflineMatches(matches)).toBe(20);
    expect(matches[0]?.document.ledgerEntries).toHaveLength(2);
  });

  it("requires the same entry to satisfy amount and search conditions", () => {
    const original = document([entry("coffee", "Coffee", "80"), entry("cake", "Cake", "20")]);
    expect(selectOfflineDocuments([original], { search: "coffee", maxAmount: 30 })).toEqual([]);
  });
});
