import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDetailsTabGrouping } from "@/features/ledger/client/hooks/use-details-tab-grouping";
import { formatDateTimeForApi } from "@/lib/date-utils";
import type { LedgerEntry } from "@/types/api";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

function createEntry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: crypto.randomUUID(),
    ledgerId: "ledger-1",
    sourceDocumentId: null,
    categoryId: null,
    itemName: "item",
    amount: "0.00",
    currency: "CNY",
    description: null,
    convertedAmount: "0.00",
    exchangeRate: "1.00",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    sourceDocument: null,
    category: null,
    ...overrides,
  };
}

describe("useDetailsTabGrouping", () => {
  it("groups entries using today/yesterday labels and totals", () => {
    const today = formatDateTimeForApi(new Date())!;
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = formatDateTimeForApi(yesterdayDate)!;

    const entries = [
      createEntry({
        amount: "8.00",
        convertedAmount: "10.50",
        sourceDocument: {
          id: "doc-today",
          ledgerId: "ledger-1",
          title: "today",
          text: null,
          type: "ai_parsed",
          status: "completed",
          entryDate: today,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
          metadata: {},
          anomalyReason: null,
        },
      }),
      createEntry({
        amount: "5.25",
        convertedAmount: null,
        sourceDocument: {
          id: "doc-yesterday",
          ledgerId: "ledger-1",
          title: "yesterday",
          text: null,
          type: "ai_parsed",
          status: "completed",
          entryDate: yesterday,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
          metadata: {},
          anomalyReason: null,
        },
      }),
    ];

    const { result } = renderHook(() => useDetailsTabGrouping(entries));

    expect(result.current.groupedItems).toHaveLength(2);
    expect(result.current.groupedItems[0].title).toBe("today");
    expect(result.current.groupedItems[0].total).toBe(10.5);
    expect(result.current.groupedItems[1].title).toBe("yesterday");
    expect(result.current.groupedItems[1].total).toBe(5.25);
  });

  it("falls back to createdAt when source document entryDate is missing", () => {
    const createdAt = new Date("2024-02-03T10:00:00.000Z").toISOString();
    const entries = [
      createEntry({
        amount: "12.00",
        convertedAmount: "12.00",
        createdAt,
        sourceDocument: {
          id: "doc-no-date",
          ledgerId: "ledger-1",
          title: "no-date",
          text: null,
          type: "ai_parsed",
          status: "completed",
          entryDate: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          hasImages: false,
          metadata: {},
          anomalyReason: null,
        },
      }),
    ];

    const { result } = renderHook(() => useDetailsTabGrouping(entries));

    expect(result.current.getDateStr(entries[0])).toBe("2024-02-03");
    expect(result.current.groupedItems[0].total).toBe(12);
  });
});
