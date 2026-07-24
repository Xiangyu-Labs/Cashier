import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const calculateLedgerStatsMock = vi.hoisted(() => vi.fn());
const listLedgerEntriesMock = vi.hoisted(() => vi.fn());
const getSourceDocumentAttentionQueryMock = vi.hoisted(() => vi.fn());
const getSourceDocumentCountsQueryMock = vi.hoisted(() => vi.fn());
const listSourceDocumentsMock = vi.hoisted(() => vi.fn());
const getEnhancedStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
}));

vi.mock("@/modules/ledger/application/queries/list-entry-categories", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));
vi.mock("@/modules/ledger/application/queries/calculate-ledger-stats", () => ({
  calculateLedgerStats: calculateLedgerStatsMock,
}));
vi.mock("@/modules/ledger/application/queries/list-ledger-entries", () => ({
  listLedgerEntries: listLedgerEntriesMock,
}));

vi.mock("@/modules/source-document/application/queries/get-source-document-attention", () => ({
  getSourceDocumentAttentionQuery: getSourceDocumentAttentionQueryMock,
}));
vi.mock("@/modules/source-document/application/queries/get-source-document-counts", () => ({
  getSourceDocumentCountsQuery: getSourceDocumentCountsQueryMock,
}));
vi.mock("@/modules/source-document/application/queries/list-source-document-page", () => ({
  listSourceDocuments: listSourceDocumentsMock,
}));

vi.mock("@/modules/stats/application/queries/get-enhanced-stats", () => ({
  getEnhancedStats: getEnhancedStatsMock,
}));

function createAuthorizedLedger() {
  return {
    userId: "user-1",
    ledger: {
      id: "ledger-1",
      userId: "user-1",
      settings: { mainCurrency: "USD" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createPreAuthorizedLedgerDto() {
  return {
    id: "ledger-1",
    userId: "user-1",
    metadata: { settings: { mainCurrency: "USD" } },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null as string | null,
  };
}

describe("getLedgerPageBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireLedgerAccessMock.mockResolvedValue(createAuthorizedLedger());
    listEntryCategoriesMock.mockResolvedValue([]);
    calculateLedgerStatsMock.mockResolvedValue({});
    listLedgerEntriesMock.mockResolvedValue({ items: [], nextCursor: null });
    getSourceDocumentAttentionQueryMock.mockResolvedValue({ items: [], total: 0 });
    getSourceDocumentCountsQueryMock.mockResolvedValue({ processingCount: 0, attentionCount: 0 });
    listSourceDocumentsMock.mockResolvedValue({ items: [], nextCursor: null });
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

  it("accepts a pre-authorized ledger DTO and skips re-authorization", async () => {
    const preAuthDto = createPreAuthorizedLedgerDto();
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      ledgerDto: preAuthDto,
    });

    expect(result).not.toBeNull();
    // requireLedgerAccess should NOT have been called when ledgerDto is provided
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
    // The DTO should be seeded into the dehydrated state
    const ledgersQuery = result?.dehydratedState.queries.find(
      (q) => q.queryKey[0] === "ledger"
    );
    expect(ledgersQuery).toBeDefined();
    expect(ledgersQuery?.state.data).toEqual(preAuthDto);
  });

  it("prefetches stream tab attention, counts, and first completed page with period-bound dates", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: {
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      },
      // Use pre-authorized DTO to test the path without re-authorization
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(result).not.toBeNull();
    expect(getSourceDocumentAttentionQueryMock).toHaveBeenCalledWith("ledger-1");
    expect(getSourceDocumentCountsQueryMock).toHaveBeenCalledWith("ledger-1");
    expect(listSourceDocumentsMock).toHaveBeenCalled();
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
    expect(calculateLedgerStatsMock).toHaveBeenCalledWith(
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "USD"
    );
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
    expect(getEnhancedStatsMock).not.toHaveBeenCalled();
  });

  it("passes min/max amount filters into completed page prefetch", async () => {
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
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(result).not.toBeNull();
    // listSourceDocuments should be called with completed status and filters
    expect(listSourceDocumentsMock).toHaveBeenCalledWith("ledger-1", {
      status: "completed",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      minAmount: 20,
      maxAmount: 100,
      cursor: undefined,
      limit: 20,
      includeEntries: true,
    });
  });

  it("prefetches details tab summary and paged entries", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "details",
      periodParams: { period: "thisMonth" },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(calculateLedgerStatsMock).toHaveBeenCalledOnce();
    expect(listLedgerEntriesMock).toHaveBeenCalledOnce();
    expect(getSourceDocumentAttentionQueryMock).not.toHaveBeenCalled();
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
      ledgerDto: createPreAuthorizedLedgerDto(),
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
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stats",
      periodParams: { period: "thisMonth" },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(getEnhancedStatsMock).toHaveBeenCalledOnce();
    expect(calculateLedgerStatsMock).not.toHaveBeenCalled();
    expect(getSourceDocumentAttentionQueryMock).not.toHaveBeenCalled();
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
  });

  it("uses CNY default currency when ledger metadata has no mainCurrency", async () => {
    const dto = {
      ...createPreAuthorizedLedgerDto(),
      metadata: { settings: {} },
    };
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      ledgerDto: dto,
    });

    expect(result).not.toBeNull();
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
  });

  it("does not prefetch a multi-ledger list for the single-ledger workspace", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(result).not.toBeNull();
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
    expect(result?.dehydratedState.queries.some((query) => query.queryKey[0] === "ledgers")).toBe(
      false
    );
  });
});
