import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLedgerEntryWithConversionMock,
  updateLedgerEntryWithConversionMock,
  batchUpdateLedgerEntriesMock,
  calculateLedgerEntryStatsMock,
  createDefaultLedgerMock,
  mapLedgerDtoMock,
  findLedgerMock,
} = vi.hoisted(() => ({
  createLedgerEntryWithConversionMock: vi.fn(),
  updateLedgerEntryWithConversionMock: vi.fn(),
  batchUpdateLedgerEntriesMock: vi.fn(),
  calculateLedgerEntryStatsMock: vi.fn(),
  createDefaultLedgerMock: vi.fn(),
  mapLedgerDtoMock: vi.fn(),
  findLedgerMock: vi.fn(),
}));

vi.mock("@/lib/auth-actions", () => ({
  withLedgerAccess: <TArgs extends unknown[], TResult>(
    handler: (ledgerId: string, ...args: TArgs) => TResult
  ) => handler,
  withAuth: <TArgs extends unknown[], TResult>(
    handler: (userId: string, ...args: TArgs) => TResult
  ) => handler,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      ledgers: {
        findFirst: findLedgerMock,
      },
    },
  },
}));

vi.mock("@/modules/ledger/application/use-cases/mutate-ledger-entries", () => ({
  createLedgerEntryWithConversion: createLedgerEntryWithConversionMock,
  updateLedgerEntryWithConversion: updateLedgerEntryWithConversionMock,
  batchUpdateLedgerEntries: batchUpdateLedgerEntriesMock,
}));

vi.mock("@/modules/ledger/application/queries/calculate-ledger-entry-stats", () => ({
  calculateLedgerEntryStats: calculateLedgerEntryStatsMock,
}));

vi.mock("@/modules/ledger/application/use-cases/create-default-ledger", () => ({
  createDefaultLedger: createDefaultLedgerMock,
}));

vi.mock("@/modules/ledger/mappers", () => ({
  mapLedgerDto: mapLedgerDtoMock,
}));

import {
  batchUpdateLedgerEntriesAction,
  createLedgerEntryAction,
  updateLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import { calculateLedgerStats } from "@/modules/ledger/server-actions/stats";
import { createLedgerAction } from "@/modules/ledger/server-actions/create";

describe("ledger server action omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLedgerEntryWithConversionMock.mockResolvedValue({ id: "entry-1" });
    updateLedgerEntryWithConversionMock.mockResolvedValue({ id: "entry-1" });
    batchUpdateLedgerEntriesMock.mockResolvedValue(1);
    calculateLedgerEntryStatsMock.mockResolvedValue({
      convertedTotal: { total: 0, currency: "CNY" },
      totals: [],
      trend: [],
      byCategory: [],
    });
    findLedgerMock.mockResolvedValue(null);
    createDefaultLedgerMock.mockResolvedValue({
      id: "ledger-1",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      metadata: null,
    });
    mapLedgerDtoMock.mockImplementation((value: unknown) => value);
  });

  it("omits absent optional create-entry fields", async () => {
    await createLedgerEntryAction("ledger-1", {
      amount: 12.5,
      itemName: "Lunch",
      sourceDocumentId: "123e4567-e89b-42d3-a456-426614174000",
    });

    const payload = createLedgerEntryWithConversionMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(payload.amount).toBe(12.5);
    expect(payload.itemName).toBe("Lunch");
    expect(Object.prototype.hasOwnProperty.call(payload, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "description")).toBe(false);
  });

  it("omits absent optional update-entry fields", async () => {
    await updateLedgerEntryAction("ledger-1", "123e4567-e89b-42d3-a456-426614174001", {
      description: null,
    });

    const payload = updateLedgerEntryWithConversionMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(payload.ledgerEntryId).toBe("123e4567-e89b-42d3-a456-426614174001");
    expect(payload.description).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(payload, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "amount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "itemName")).toBe(false);
  });

  it("omits absent optional batch-update fields", async () => {
    await batchUpdateLedgerEntriesAction(
      "ledger-1",
      ["123e4567-e89b-42d3-a456-426614174002"],
      { amount: 9.99 }
    );

    const payload = batchUpdateLedgerEntriesMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(payload.ledgerEntryIds).toEqual(["123e4567-e89b-42d3-a456-426614174002"]);
    expect(payload.amount).toBe(9.99);
    expect(Object.prototype.hasOwnProperty.call(payload, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "description")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "itemName")).toBe(false);
  });

  it("omits absent stats filters", async () => {
    await calculateLedgerStats("ledger-1");

    const payload = calculateLedgerEntryStatsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const filters = payload.filters as Record<string, unknown>;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(Object.prototype.hasOwnProperty.call(payload, "mainCurrency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "startDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "endDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "minAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(filters, "maxAmount")).toBe(false);
  });

  it("omits locale when creating a ledger without aiLanguage", async () => {
    await createLedgerAction("user-1", {});

    const payload = createDefaultLedgerMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.userId).toBe("user-1");
    expect(Object.prototype.hasOwnProperty.call(payload, "locale")).toBe(false);
  });
});
