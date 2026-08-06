import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  convertEntryAmountMock,
  formatDateTimeForApiMock,
  getEntryCategoryNameMock,
  createManualMock,
} = vi.hoisted(() => ({
  convertEntryAmountMock: vi.fn(),
  formatDateTimeForApiMock: vi.fn(),
  getEntryCategoryNameMock: vi.fn(),
  createManualMock: vi.fn(),
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateTimeForApi: formatDateTimeForApiMock,
  getDateInTimezone: vi.fn(() => undefined),
}));

vi.mock("@/application/server-composition-root", () => ({
  serverComposition: {
    ledgerProjections: { createManual: createManualMock },
  },
}));

vi.mock("@/application/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration: vi.fn(),
}));

vi.mock("@/modules/currency/application/use-cases/convert-entry-amount", () => ({
  convertEntryAmount: convertEntryAmountMock,
}));

vi.mock("@/modules/ledger/source-document-queries", () => ({
  getEntryCategoryName: getEntryCategoryNameMock,
}));

import { createQuickEntry } from "@/modules/source-document/application/use-cases/create-quick-entry";
import type { QuickEntryPorts } from "@/modules/source-document/application/ports";

const ports = {
  categories: {},
  projections: { createManual: createManualMock },
  rates: {},
} as unknown as QuickEntryPorts;

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
    createManualMock.mockResolvedValue({ sourceDocumentId: "doc-1", revisionId: "revision-1" });
    randomUuidSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce("entry-1");
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
        settings: { mainCurrency: "USD" },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        categoryId: "cat-1",
        amount: 100,
      },
      ports
    );

    expect(convertEntryAmountMock).toHaveBeenCalledWith(
      {
        amount: "100",
        fromCurrency: "USD",
        toCurrency: "USD",
        date: "2026-03-20",
      },
      ports.rates
    );
    expect(createManualMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      title: "Food",
      entryDate: "2026-03-20",
      entries: [
        expect.objectContaining({
          id: "entry-1",
          currency: "USD",
          itemName: "Food",
          convertedAmount: "100.00",
        }),
      ],
    });
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
        settings: { mainCurrency: "USD" },
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
      },
      ports
    );

    expect(convertEntryAmountMock).toHaveBeenCalledWith(
      {
        amount: "25",
        fromCurrency: "CNY",
        toCurrency: "USD",
        date: "2026-01-31",
      },
      ports.rates
    );
    expect(createManualMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: "2026-01-31",
        entries: [
          expect.objectContaining({
            currency: "CNY",
            itemName: "Tea",
            description: "afternoon",
          }),
        ],
      })
    );
  });
});
