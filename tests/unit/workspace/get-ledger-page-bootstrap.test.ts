import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getLedgerPageBootstrap } from "@/modules/workspace/queries";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const getLedgersMock = vi.hoisted(() => vi.fn());
const calculateLedgerStatsMock = vi.hoisted(() => vi.fn());
const listLedgerEntriesMock = vi.hoisted(() => vi.fn());
const getPendingSourceDocumentsMock = vi.hoisted(() => vi.fn());
const getSourceDocumentCollectionMock = vi.hoisted(() => vi.fn());
const getEnhancedStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

vi.mock("@/modules/ledger/application/queries/list-entry-categories", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));
vi.mock("@/modules/ledger/application/queries/list-ledgers", () => ({
  getLedgers: getLedgersMock,
}));
vi.mock("@/modules/ledger/application/queries/calculate-ledger-stats", () => ({
  calculateLedgerStats: calculateLedgerStatsMock,
}));
vi.mock("@/modules/ledger/application/queries/list-ledger-entries", () => ({
  listLedgerEntries: listLedgerEntriesMock,
}));

vi.mock("@/modules/source-document/application/queries/get-pending-source-documents", () => ({
  getPendingSourceDocuments: getPendingSourceDocumentsMock,
}));
vi.mock("@/modules/source-document/application/queries/list-source-document-collection", () => ({
  getSourceDocumentCollection: getSourceDocumentCollectionMock,
}));

vi.mock("@/modules/stats/queries", () => ({
  getEnhancedStats: getEnhancedStatsMock,
}));

function createAuthorizedLedger() {
  return {
    userId: "user-1",
    ledger: {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: { mainCurrency: "USD" } },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    },
  };
}

describe("getLedgerPageBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireLedgerAccessMock.mockResolvedValue(createAuthorizedLedger());
    listEntryCategoriesMock.mockResolvedValue([]);
    getLedgersMock.mockResolvedValue([]);
    calculateLedgerStatsMock.mockResolvedValue({});
    listLedgerEntriesMock.mockResolvedValue({ items: [], nextCursor: null });
    getPendingSourceDocumentsMock.mockResolvedValue([]);
    getSourceDocumentCollectionMock.mockResolvedValue({ items: [], hasMore: false, total: 0 });
    getEnhancedStatsMock.mockResolvedValue({});
  });

  it("returns null on not-found and unauthorized access errors", async () => {
    requireLedgerAccessMock.mockRejectedValueOnce(new NotFoundError("ledger"));
    const notFound = await getLedgerPageBootstrap({
      ledgerId: "missing",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
    });
    expect(notFound).toBeNull();

    requireLedgerAccessMock.mockRejectedValueOnce(new UnauthorizedError());
    const unauthorized = await getLedgerPageBootstrap({
      ledgerId: "forbidden",
      initialTab: "details",
      periodParams: { period: "thisMonth" },
    });
    expect(unauthorized).toBeNull();
  });

  it("rethrows unknown errors", async () => {
    requireLedgerAccessMock.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(
      getLedgerPageBootstrap({
        ledgerId: "ledger-1",
        initialTab: "stream",
        periodParams: { period: "thisMonth" },
      })
    ).rejects.toThrow("db unavailable");
  });

  it("prefetches stream tab sources and summary with period-bound dates", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: {
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      },
    });

    expect(result).not.toBeNull();
    expect(getPendingSourceDocumentsMock).toHaveBeenCalledWith("ledger-1");
    expect(getSourceDocumentCollectionMock).toHaveBeenCalledWith("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      limit: 1000,
    });
    expect(calculateLedgerStatsMock).toHaveBeenCalledWith(
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "USD"
    );
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
    expect(getEnhancedStatsMock).not.toHaveBeenCalled();
  });

  it("passes min/max amount filters into stream source-document bootstrap queries", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: {
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      },
      advancedFilters: {
        minAmount: 20,
        maxAmount: 100,
      },
    });

    expect(result).not.toBeNull();
    expect(getSourceDocumentCollectionMock).toHaveBeenCalledWith("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      minAmount: 20,
      maxAmount: 100,
      limit: 1000,
    });
  });

  it("prefetches details tab summary and paged entries", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "details",
      periodParams: { period: "thisMonth" },
    });

    expect(calculateLedgerStatsMock).toHaveBeenCalledOnce();
    expect(listLedgerEntriesMock).toHaveBeenCalledOnce();
    expect(getPendingSourceDocumentsMock).not.toHaveBeenCalled();
    expect(getEnhancedStatsMock).not.toHaveBeenCalled();
  });

  it("passes advanced filters into details tab summary and entries prefetch", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "details",
      periodParams: {
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      },
      advancedFilters: {
        categoryId: "cat-1",
        currency: "USD",
        minAmount: 20,
        maxAmount: 100,
      },
    });

    expect(calculateLedgerStatsMock).toHaveBeenCalledWith(
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "USD",
      {
        categoryId: "cat-1",
        currency: "USD",
        minAmount: 20,
        maxAmount: 100,
      }
    );
    expect(listLedgerEntriesMock).toHaveBeenCalledWith("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "cat-1",
      currency: "USD",
      minAmount: 20,
      maxAmount: 100,
      cursor: undefined,
      limit: 50,
    });
  });

  it("prefetches stats tab enhanced stats and falls back to CNY main currency", async () => {
    requireLedgerAccessMock.mockResolvedValueOnce({
      userId: "user-1",
      ledger: {
        ...createAuthorizedLedger().ledger,
        metadata: {},
      },
    });

    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stats",
      periodParams: { period: "thisMonth" },
    });

    expect(getEnhancedStatsMock).toHaveBeenCalledOnce();
    expect(calculateLedgerStatsMock).not.toHaveBeenCalled();
    expect(getPendingSourceDocumentsMock).not.toHaveBeenCalled();
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
  });
});
