import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLedgerEntryWithConversionMock,
  updateLedgerEntryWithConversionMock,
  batchUpdateLedgerEntriesMock,
  calculateLedgerEntryStatsMock,
  createLedgerMock,
} = vi.hoisted(() => ({
  createLedgerEntryWithConversionMock: vi.fn(),
  updateLedgerEntryWithConversionMock: vi.fn(),
  batchUpdateLedgerEntriesMock: vi.fn(),
  calculateLedgerEntryStatsMock: vi.fn(),
  createLedgerMock: vi.fn(),
}));

vi.mock("@/lib/auth-actions", () => ({
  withAuth:
    <TArgs extends unknown[], TResult>(handler: (userId: string, ...args: TArgs) => TResult) =>
    (...args: TArgs) =>
      handler("user-1", ...args),
}));

vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("zh") }));

vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess: <TArgs extends unknown[], TResult>(
    handler: (ledgerId: string, ...args: TArgs) => TResult
  ) => handler,
  withLedgerAccessContext:
    <TArgs extends unknown[], TResult>(
      handler: (access: { userId: string }, ledgerId: string, ...args: TArgs) => TResult
    ) =>
    (ledgerId: string, ...args: TArgs) =>
      handler({ userId: "00000000-0000-4000-8000-000000000001" }, ledgerId, ...args),
}));

vi.mock("@/application/server-composition-root", () => ({
  serverComposition: {
    ledgerEntryCommands: {
      create: createLedgerEntryWithConversionMock,
      update: updateLedgerEntryWithConversionMock,
      delete: vi.fn(),
    },
    sourceDocumentAggregate: {
      batchUpdateEntries: batchUpdateLedgerEntriesMock,
    },
    categories: {},
    ledgerReads: {},
    ledgerEntryDates: {},
  },
}));
vi.mock("@/modules/ledger/application/use-cases/create-default-ledger", () => ({
  createDefaultLedger: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/create-entry-category", () => ({
  createEntryCategory: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/create-ledger", () => ({
  createLedger: createLedgerMock,
}));
vi.mock("@/modules/ledger/application/use-cases/create-service-credential", () => ({
  createServiceCredential: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/delete-entry-category", () => ({
  deleteEntryCategory: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/delete-ledger", () => ({
  deleteLedger: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/delete-service-credential", () => ({
  deleteServiceCredential: vi.fn(),
}));
vi.mock("@/modules/ledger/application/services/recalculate-entries-converted-amount", () => ({
  recalculateEntriesConvertedAmount: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/reorder-entry-categories", () => ({
  reorderEntryCategories: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/update-entry-category", () => ({
  updateEntryCategory: vi.fn(),
}));
vi.mock("@/modules/ledger/application/use-cases/update-ledger", () => ({
  updateLedger: vi.fn(),
}));

vi.mock("@/modules/ledger/application/queries/calculate-ledger-entry-stats", () => ({
  calculateLedgerEntryStats: calculateLedgerEntryStatsMock,
}));

import {
  batchUpdateLedgerEntriesAction,
  createLedgerEntryAction,
  createLedgerAction,
  updateLedgerEntryAction,
} from "@/modules/ledger/actions";
import { calculateLedgerStats as calculateLedgerStatsUseCase } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";

const calculateLedgerStats = (ledgerId: string) =>
  calculateLedgerStatsUseCase(ledgerId, {}, {} as LedgerReadPort);

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
    createLedgerMock.mockResolvedValue({
      id: "ledger-1",
      userId: "user-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      metadata: null,
    });
  });

  it("omits absent optional create-entry fields", async () => {
    await createLedgerEntryAction(
      "ledger-1",
      {
        sourceDocumentId: "123e4567-e89b-42d3-a456-426614174000",
        expectedVersion: 1,
      },
      {
        amount: "12.5",
        itemName: "Lunch",
        sourceDocumentId: "123e4567-e89b-42d3-a456-426614174000",
      }
    );

    const payload = createLedgerEntryWithConversionMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(payload.amount).toBe("12.5");
    expect(payload.itemName).toBe("Lunch");
    expect(Object.prototype.hasOwnProperty.call(payload, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "description")).toBe(false);
  });

  it("omits absent optional update-entry fields", async () => {
    await updateLedgerEntryAction(
      "ledger-1",
      {
        sourceDocumentId: "123e4567-e89b-42d3-a456-426614174000",
        expectedVersion: 1,
      },
      "123e4567-e89b-42d3-a456-426614174001",
      {
        description: null,
      }
    );

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
      [
        {
          sourceDocumentId: "123e4567-e89b-42d3-a456-426614174000",
          expectedVersion: 1,
        },
      ],
      ["123e4567-e89b-42d3-a456-426614174002"],
      { amount: "9.99" }
    );

    const payload = batchUpdateLedgerEntriesMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.ledgerId).toBe("ledger-1");
    expect(payload.ledgerEntryIds).toEqual(["123e4567-e89b-42d3-a456-426614174002"]);
    expect(payload.amount).toBe("9.99");
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

  it("uses the request locale when creating a ledger", async () => {
    await createLedgerAction({});

    const firstCall = createLedgerMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall == null) {
      throw new Error("Expected createLedger to be called");
    }
    const payload = firstCall[0] as Record<string, unknown>;

    expect(payload.userId).toBe("user-1");
    expect(payload.locale).toBe("zh");
  });
});
