import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  convertEntryAmountMock,
  formatDateTimeForApiMock,
  getEntryCategoryNameMock,
  insertSourceDocumentLedgerEntryMock,
  insertValuesRunMock: _insertValuesRunMock,
  insertValuesMock,
  transactionMock,
} = vi.hoisted(() => {
  const insertValuesRunMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ run: insertValuesRunMock }));
  const transactionMock = vi.fn((callback: (tx: unknown) => void) =>
    callback({
      insert: vi.fn(() => ({ values: insertValuesMock })),
    })
  );

  return {
    convertEntryAmountMock: vi.fn(),
    formatDateTimeForApiMock: vi.fn(),
    getEntryCategoryNameMock: vi.fn(),
    insertSourceDocumentLedgerEntryMock: vi.fn(),
    insertValuesRunMock,
    insertValuesMock,
    transactionMock,
  };
});

vi.mock("@/lib/date-utils", () => ({
  formatDateTimeForApi: formatDateTimeForApiMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/lib/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration: vi.fn(),
}));

vi.mock("@/modules/currency/application/use-cases/convert-entry-amount", () => ({
  convertEntryAmount: convertEntryAmountMock,
}));

vi.mock("@/modules/ledger/source-document-queries", () => ({
  getEntryCategoryName: getEntryCategoryNameMock,
}));

vi.mock("@/modules/source-document/application/services/source-document-ledger-entries", () => ({
  insertSourceDocumentLedgerEntry: insertSourceDocumentLedgerEntryMock,
}));

import { createQuickEntry } from "@/modules/source-document/application/use-cases/create-quick-entry";

describe("createQuickEntry", () => {
  let randomUuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    formatDateTimeForApiMock.mockReturnValue("2026-03-20");
    getEntryCategoryNameMock.mockResolvedValue("Food");
    convertEntryAmountMock.mockResolvedValue({
      convertedAmount: "100.00",
      exchangeRate: "1.0000",
    });
    randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("doc-1")
      .mockReturnValueOnce("entry-1");
  });

  afterEach(() => {
    randomUuidSpy.mockRestore();
  });

  it("uses ledger main currency and current date when payload omits them", async () => {
    const result = await createQuickEntry(
      "ledger-1",
      {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        categoryId: "cat-1",
        amount: 100,
      }
    );

    expect(convertEntryAmountMock).toHaveBeenCalledWith({
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "USD",
      date: "2026-03-20",
    });
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        ledgerId: "ledger-1",
        title: "Food",
        status: "completed",
        entryDate: "2026-03-20",
      })
    );
    expect(insertSourceDocumentLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "entry-1",
        sourceDocumentId: "doc-1",
        currency: "USD",
        itemName: "Food",
        convertedAmount: "100.00",
      })
    );
    expect(result).toEqual({
      sourceDocumentId: "doc-1",
      ledgerEntryId: "entry-1",
      status: "completed",
    });
  });

  it("uses provided currency, entryDate, itemName, and description", async () => {
    await createQuickEntry(
      "ledger-1",
      {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        categoryId: "cat-1",
        amount: 25,
        currency: "CNY",
        entryDate: "2026-01-31",
        itemName: "Tea",
        description: "afternoon",
      }
    );

    expect(convertEntryAmountMock).toHaveBeenCalledWith({
      amount: 25,
      fromCurrency: "CNY",
      toCurrency: "USD",
      date: "2026-01-31",
    });
    expect(insertSourceDocumentLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        currency: "CNY",
        itemName: "Tea",
        description: "afternoon",
      })
    );
  });
});
