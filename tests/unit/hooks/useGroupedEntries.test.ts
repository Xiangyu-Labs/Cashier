import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGroupedEntries } from "@/modules/ledger/hooks/useGroupedEntries";
import { formatDateTimeForApi } from "@/lib/date-utils";
import type { SourceDocumentGroup } from "@/lib/serialization";

function createGroup(overrides: Partial<SourceDocumentGroup>): SourceDocumentGroup {
  return {
    sourceDocument: {
      id: crypto.randomUUID(),
      ledgerId: "ledger-1",
      title: "Document",
      text: null,
      type: "ai_parsed",
      imageUrls: [],
      status: "completed",
      metadata: {},
      anomalyReason: null,
      entryDate: formatDateTimeForApi(new Date())!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      hasImages: false,
    },
    ledgerEntries: [],
    ...overrides,
  };
}

function requireFirst<T>(rows: readonly T[], label: string): T {
  const first = rows[0];
  if (!first) {
    throw new Error(`Expected at least one ${label}`);
  }
  return first;
}

describe("useGroupedEntries", () => {
  it("groups source documents and sums converted totals", () => {
    const today = formatDateTimeForApi(new Date())!;
    const previousDate = "2024-01-15";

    const completedGroups = [
      createGroup({
        sourceDocument: {
          id: "doc-today",
          ledgerId: "ledger-1",
          title: "Today",
          text: null,
          type: "ai_parsed",
          imageUrls: [],
          status: "completed",
          metadata: {},
          anomalyReason: null,
          entryDate: today,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
        },
        ledgerEntries: [
          {
            id: "entry-1",
            ledgerId: "ledger-1",
            sourceDocumentId: "doc-today",
            categoryId: null,
            itemName: "Lunch",
            amount: "20.00",
            currency: "USD",
            description: null,
            convertedAmount: "30.00",
            exchangeRate: "1.50",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
      }),
      createGroup({
        sourceDocument: {
          id: "doc-old",
          ledgerId: "ledger-1",
          title: "Old",
          text: null,
          type: "ai_parsed",
          imageUrls: [],
          status: "completed",
          metadata: {},
          anomalyReason: null,
          entryDate: previousDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
        },
        ledgerEntries: [
          {
            id: "entry-2",
            ledgerId: "ledger-1",
            sourceDocumentId: "doc-old",
            categoryId: null,
            itemName: "Snack",
            amount: "9.50",
            currency: "CNY",
            description: null,
            convertedAmount: "",
            exchangeRate: "1.00",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
      }),
    ];

    const { result } = renderHook(() =>
      useGroupedEntries({
        completedGroups,
        locale: "en",
        tDetails: (key) => key,
      })
    );

    const groupedByDate = result.current.groupedCompletedByDate;
    expect(groupedByDate).toHaveLength(2);
    const firstGroup = requireFirst(groupedByDate, "grouped date bucket");
    const secondGroup = groupedByDate[1];
    if (!secondGroup) {
      throw new Error("Expected second grouped date bucket");
    }
    expect(firstGroup.title).toBe("today");
    expect(firstGroup.total).toBe(30);
    expect(secondGroup.total).toBe(9.5);
    expect(result.current.allSourceDocumentIds).toEqual(["doc-today", "doc-old"]);
  });

  it("falls back to source document createdAt when entryDate is missing", () => {
    const createdAt = new Date("2024-04-06T08:00:00.000Z").toISOString();
    const completedGroups = [
      createGroup({
        sourceDocument: {
          id: "doc-fallback",
          ledgerId: "ledger-1",
          title: "Fallback",
          text: null,
          type: "ai_parsed",
          imageUrls: [],
          status: "completed",
          metadata: {},
          anomalyReason: null,
          entryDate: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          hasImages: false,
        },
      }),
    ];

    const { result } = renderHook(() =>
      useGroupedEntries({
        completedGroups,
        locale: "en",
        tDetails: (key) => key,
      })
    );

    const firstGroup = requireFirst(result.current.groupedCompletedByDate, "grouped date bucket");
    const firstItem = requireFirst(firstGroup.items, "grouped item");
    expect(firstItem.sourceDocument.id).toBe("doc-fallback");
    expect(firstGroup.timestamp).toBe(new Date(2024, 3, 6).getTime());
  });
});
