import { beforeEach, describe, expect, it, vi } from "vitest";

const { convertEntryAmountMock, formatDateTimeForApiMock, loggerWarnMock } = vi.hoisted(() => ({
  convertEntryAmountMock: vi.fn(),
  formatDateTimeForApiMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateTimeForApi: formatDateTimeForApiMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

vi.mock("@/lib/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration: vi.fn(),
}));

vi.mock("@/modules/currency/use-cases", () => ({
  convertEntryAmount: convertEntryAmountMock,
}));

import {
  buildEntriesForInsert,
  getEntryFallbackDate,
  validateEntries,
} from "@/modules/source-document/application/parse-source-document/entry-builder";

describe("entry-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatDateTimeForApiMock.mockReturnValue("2026-03-23");
  });

  it("maps categoryIndex, fallback item name, and conversion failures safely", async () => {
    convertEntryAmountMock.mockRejectedValueOnce(new Error("rate unavailable"));

    const result = await buildEntriesForInsert({
      validEntries: [
        {
          amount: 10,
          currency: "USD",
          categoryIndex: 1,
          entryDate: null,
          itemName: "",
          notes: null,
        },
      ],
      categories: [{ id: "cat-1", name: "Food", description: null }],
      sourceDocumentId: "doc-1",
      ledgerId: "ledger-1",
      mainCurrency: "CNY",
      fallbackDate: "2026-03-20",
    });

    expect(result[0]).toMatchObject({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      categoryId: "cat-1",
      amount: "10.00",
      currency: "USD",
      itemName: "Uncategorized",
      description: null,
      entryDate: "2026-03-20",
      convertedAmount: null,
      exchangeRate: null,
    });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it("rejects entries with no positive amounts or unknown currencies", () => {
    expect(
      validateEntries([
        {
          amount: 0,
          currency: "CNY",
          categoryIndex: 0,
          entryDate: null,
          itemName: "Ignored",
          notes: null,
        },
      ])
    ).toEqual({ isValid: false, reason: "No entries with valid amount" });

    expect(
      validateEntries([
        {
          amount: 12,
          currency: "unknown",
          categoryIndex: 0,
          entryDate: null,
          itemName: "Bad currency",
          notes: null,
        },
      ])
    ).toEqual({ isValid: false, reason: "Unable to recognize currency type" });
  });

  it("uses the document entry date when present and today otherwise", () => {
    expect(getEntryFallbackDate("2026-03-20")).toEqual({
      todayDate: "2026-03-23",
      fallbackDate: "2026-03-20",
    });

    expect(getEntryFallbackDate(null)).toEqual({
      todayDate: "2026-03-23",
      fallbackDate: "2026-03-23",
    });
  });
});
