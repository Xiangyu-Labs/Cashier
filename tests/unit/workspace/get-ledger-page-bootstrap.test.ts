import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getLedgerPageBootstrap as getLedgerPageBootstrapUseCase } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import { buildStatsQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";
import type { CategoryPort } from "@/application/contracts";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import type { StatsReadPort } from "@/modules/stats/application/ports";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";
import type { ServiceCredentialPort } from "@/application/contracts";

const bootstrapDependencies = {
  categories: {} as CategoryPort,
  ledgerReads: {} as LedgerReadPort,
  stats: {} as StatsReadPort,
  sourceDocuments: { documents: {}, ledgerReads: {} } as SourceDocumentQueryPorts,
  credentials: {} as ServiceCredentialPort,
};
const getLedgerPageBootstrap = (input: Parameters<typeof getLedgerPageBootstrapUseCase>[0]) =>
  getLedgerPageBootstrapUseCase(input, bootstrapDependencies);

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const calculateLedgerStatsMock = vi.hoisted(() => vi.fn());
const listLedgerEntriesMock = vi.hoisted(() => vi.fn());
const getSourceDocumentCountsQueryMock = vi.hoisted(() => vi.fn());
const listStreamPageMock = vi.hoisted(() => vi.fn());
const getStreamTotalMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/modules/source-document/application/queries/get-source-document-counts", () => ({
  getSourceDocumentCountsQuery: getSourceDocumentCountsQueryMock,
}));
vi.mock("@/modules/source-document/application/queries/list-stream-page", () => ({
  listStreamPage: listStreamPageMock,
}));
vi.mock("@/modules/source-document/application/queries/get-stream-total", () => ({
  getStreamTotal: getStreamTotalMock,
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
    settings: { mainCurrency: "USD" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("getLedgerPageBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireLedgerAccessMock.mockResolvedValue(createAuthorizedLedger());
    listEntryCategoriesMock.mockResolvedValue([]);
    calculateLedgerStatsMock.mockResolvedValue({});
    listLedgerEntriesMock.mockResolvedValue({ items: [], nextCursor: null });
    getSourceDocumentCountsQueryMock.mockResolvedValue({ processingCount: 0, attentionCount: 0 });
    listStreamPageMock.mockResolvedValue({ items: [], nextCursor: null, generation: 1 });
    getStreamTotalMock.mockResolvedValue({ total: "0" });
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
    const ledgersQuery = result?.dehydratedState.queries.find((q) => q.queryKey[0] === "ledger");
    expect(ledgersQuery).toBeDefined();
    expect(ledgersQuery?.state.data).toEqual(preAuthDto);
  });

  it("prefetches the first stream page without legacy header counts", async () => {
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
    expect(getSourceDocumentCountsQueryMock).not.toHaveBeenCalled();
    expect(listStreamPageMock).toHaveBeenCalled();
    expect(getStreamTotalMock).toHaveBeenCalledWith(
      "ledger-1",
      { startDate: "2026-03-01", endDate: "2026-03-31" },
      bootstrapDependencies.sourceDocuments.documents
    );
    expect(requireLedgerAccessMock).not.toHaveBeenCalled();
    expect(calculateLedgerStatsMock).not.toHaveBeenCalled();
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
    expect(getEnhancedStatsMock).not.toHaveBeenCalled();
  });

  it("passes min/max amount filters into stream page prefetch", async () => {
    await getLedgerPageBootstrap({
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

    expect(listStreamPageMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        minAmount: 20,
        maxAmount: 100,
        cursor: undefined,
        limit: 20,
      },
      bootstrapDependencies.sourceDocuments
    );
    expect(getStreamTotalMock).toHaveBeenCalledWith(
      "ledger-1",
      { startDate: "2026-03-01", endDate: "2026-03-31", minAmount: 20, maxAmount: 100 },
      bootstrapDependencies.sourceDocuments.documents
    );
  });

  it("passes status filters into stream page prefetch", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: {
        period: "custom",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      advancedFilters: {
        statuses: ["processing", "failed"],
      },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(listStreamPageMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        statuses: ["failed", "processing"],
        cursor: undefined,
        limit: 20,
      },
      bootstrapDependencies.sourceDocuments
    );
    expect(getStreamTotalMock).toHaveBeenCalledWith(
      "ledger-1",
      { startDate: "2026-07-01", endDate: "2026-07-31", statuses: ["failed", "processing"] },
      bootstrapDependencies.sourceDocuments.documents
    );
  });

  it("passes search filters into both stream page and total prefetch", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: {
        period: "custom",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      advancedFilters: {
        search: "  coffee ",
      },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(listStreamPageMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        search: "coffee",
        cursor: undefined,
        limit: 20,
      },
      bootstrapDependencies.sourceDocuments
    );
    expect(getStreamTotalMock).toHaveBeenCalledWith(
      "ledger-1",
      { startDate: "2026-07-01", endDate: "2026-07-31", search: "coffee" },
      bootstrapDependencies.sourceDocuments.documents
    );
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
    expect(getSourceDocumentCountsQueryMock).not.toHaveBeenCalled();
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
      },
      bootstrapDependencies.ledgerReads
    );
    expect(listLedgerEntriesMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        categoryId: "cat-1",
        currency: "USD",
        minAmount: 20,
        maxAmount: 100,
        cursor: undefined,
        limit: 50,
      },
      bootstrapDependencies.ledgerReads
    );
  });

  it("passes the details search filter to both summary and entries", async () => {
    await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "details",
      periodParams: {
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      },
      advancedFilters: { search: "  coffee " },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(calculateLedgerStatsMock).toHaveBeenCalledWith(
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "USD",
      { search: "coffee" },
      bootstrapDependencies.ledgerReads
    );
    expect(listLedgerEntriesMock).toHaveBeenCalledWith(
      "ledger-1",
      {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        search: "coffee",
        cursor: undefined,
        limit: 50,
      },
      bootstrapDependencies.ledgerReads
    );
  });

  it("prefetches stats tab enhanced stats and falls back to CNY main currency", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stats",
      periodParams: { period: "thisMonth" },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(getEnhancedStatsMock).toHaveBeenCalledOnce();
    expect(calculateLedgerStatsMock).not.toHaveBeenCalled();
    expect(getSourceDocumentCountsQueryMock).not.toHaveBeenCalled();
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
    const statsQuery = result?.dehydratedState.queries.find(
      (query) => query.queryKey[0] === "enhanced-stats"
    );
    expect(statsQuery?.queryKey).toEqual([
      "enhanced-stats",
      "ledger-1",
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      "month",
      "same_period",
      "USD",
    ]);
    expect(getEnhancedStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        queryRange: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
        compareRange: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
      bootstrapDependencies.stats
    );
  });

  it("prefetches stats with the full unified query key used by the stats tab", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    try {
      const result = await getLedgerPageBootstrap({
        ledgerId: "ledger-1",
        initialTab: "stats",
        periodParams: { period: "thisMonth" },
        ledgerDto: createPreAuthorizedLedgerDto(),
      });

      const statsQuery = result?.dehydratedState.queries.find(
        (query) => query.queryKey[0] === "enhanced-stats"
      );
      expect(statsQuery).toBeDefined();

      const expectedDescriptor = buildStatsQueryDescriptor({
        ledgerId: "ledger-1",
        currentDate: new Date("2026-08-06T12:00:00Z"),
        mainCurrency: "USD",
      });
      expect(statsQuery?.queryKey).toEqual(expectedDescriptor.queryKey);
      expect(statsQuery?.queryKey).toHaveLength(9);
      expect(statsQuery?.queryKey[0]).toBe("enhanced-stats");
      expect(statsQuery?.queryKey[1]).toBe("ledger-1");
      // All seven query dimensions are populated, including endDate and the
      // complete comparison window that the SSR prefetch previously omitted.
      for (const dimension of statsQuery?.queryKey.slice(2) ?? []) {
        expect(dimension).toEqual(expect.any(String));
        expect(String(dimension)).not.toBe("");
      }
      expect(getEnhancedStatsMock).toHaveBeenCalledWith(
        expectedDescriptor.input,
        bootstrapDependencies.stats
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses CNY default currency when ledger metadata has no mainCurrency", async () => {
    const dto = {
      ...createPreAuthorizedLedgerDto(),
      settings: {},
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

  it("prefetches stream query with the correct infinite query key structure", async () => {
    const result = await getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      ledgerDto: createPreAuthorizedLedgerDto(),
    });

    expect(result).not.toBeNull();

    // The stream query should be in the dehydrated state as an infinite query
    const streamQuery = result?.dehydratedState.queries.find(
      (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === "sourceDocuments" &&
        q.queryKey[1] === "ledger-1" &&
        q.queryKey[2] === "stream"
    );
    expect(streamQuery).toBeDefined();
    expect(streamQuery?.state.data).toEqual({
      pages: [{ items: [], nextCursor: null, generation: 1 }],
      pageParams: [undefined],
    });
  });
});
