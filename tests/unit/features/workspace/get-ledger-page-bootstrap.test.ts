import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const getLedgersMock = vi.hoisted(() => vi.fn());
const calculateLedgerStatsMock = vi.hoisted(() => vi.fn());
const listLedgerEntriesMock = vi.hoisted(() => vi.fn());
const getPendingSourceDocumentsMock = vi.hoisted(() => vi.fn());
const getAllSourceDocumentsMock = vi.hoisted(() => vi.fn());
const getEnhancedStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

vi.mock("@/modules/ledger/queries", () => ({
  listEntryCategories: listEntryCategoriesMock,
  getLedgers: getLedgersMock,
  calculateLedgerStats: calculateLedgerStatsMock,
  listLedgerEntries: listLedgerEntriesMock,
}));

vi.mock("@/modules/source-document/queries", () => ({
  getPendingSourceDocuments: getPendingSourceDocumentsMock,
  getAllSourceDocuments: getAllSourceDocumentsMock,
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
    getAllSourceDocumentsMock.mockResolvedValue({ items: [], nextCursor: null });
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
    expect(getAllSourceDocumentsMock).toHaveBeenCalledWith("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
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

