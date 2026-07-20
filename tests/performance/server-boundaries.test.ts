import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
import { recordPerformanceFindings } from "tests/helpers/performance-observation";

const requireLedgerAccessMock = vi.hoisted(() => vi.fn());
const listEntryCategoriesMock = vi.hoisted(() => vi.fn());
const calculateLedgerStatsMock = vi.hoisted(() => vi.fn());
const getSourceDocumentAttentionQueryMock = vi.hoisted(() => vi.fn());
const getSourceDocumentCountsQueryMock = vi.hoisted(() => vi.fn());
const listSourceDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/access", () => ({ requireLedgerAccess: requireLedgerAccessMock }));
vi.mock("@/modules/ledger/application/queries/list-entry-categories", () => ({
  listEntryCategories: listEntryCategoriesMock,
}));
vi.mock("@/modules/ledger/application/queries/calculate-ledger-stats", () => ({
  calculateLedgerStats: calculateLedgerStatsMock,
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
vi.mock("@/modules/ledger/application/queries/list-ledger-entries", () => ({ listLedgerEntries: vi.fn() }));
vi.mock("@/modules/stats/application/queries/get-enhanced-stats", () => ({ getEnhancedStats: vi.fn() }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const pending: Array<Deferred<unknown>> = [];

function pendingResult<T>(value: T): Promise<T> {
  const operation = deferred<T>();
  pending.push(operation);
  operation.promise.then(() => undefined);
  return operation.promise.then(() => value);
}

function authorizedLedger() {
  return {
    userId: "user-1",
    ledger: {
      id: "ledger-1",
      userId: "user-1",
      settings: { mainCurrency: "USD" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireLedgerAccessMock.mockResolvedValue(authorizedLedger());
  listEntryCategoriesMock.mockImplementation(() => pendingResult([]));
  getSourceDocumentAttentionQueryMock.mockImplementation(() => pendingResult({ items: [], total: 0 }));
  getSourceDocumentCountsQueryMock.mockImplementation(() =>
    pendingResult({ processingCount: 0, attentionCount: 0 })
  );
  listSourceDocumentsMock.mockImplementation(() => pendingResult({ items: [], nextCursor: null }));
  calculateLedgerStatsMock.mockImplementation(() => pendingResult({}));
});

afterEach(() => {
  for (const operation of pending.splice(0)) operation.resolve(undefined);
});

describe("ledger page server boundaries", () => {
  it("starts active stream bootstrap queries before any controlled operation resolves", async () => {
    const bootstrap = getLedgerPageBootstrap({
      ledgerId: "ledger-1",
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
    });

    await vi.waitFor(() => {
      expect(listEntryCategoriesMock).toHaveBeenCalledOnce();
      expect(getSourceDocumentAttentionQueryMock).toHaveBeenCalledOnce();
      expect(getSourceDocumentCountsQueryMock).toHaveBeenCalledOnce();
      expect(listSourceDocumentsMock).toHaveBeenCalledOnce();
      expect(calculateLedgerStatsMock).toHaveBeenCalledOnce();
    });

    for (const operation of pending.splice(0)) operation.resolve(undefined);
    await expect(bootstrap).resolves.not.toBeNull();
  });

  it("documents page-level auth and hydration boundaries from the current source", async () => {
    const [page, client, bootstrap] = await Promise.all([
      readFile(path.resolve("src/app/[locale]/(protected)/page.tsx"), "utf8"),
      readFile(path.resolve("src/modules/workspace/ui/LedgerPageClient.tsx"), "utf8"),
      readFile(
        path.resolve("src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"),
        "utf8"
      ),
    ]);

    expect((page.match(/\bauth\(\)/g) ?? [])).toHaveLength(1);
    expect(bootstrap).toContain("queryClient.setQueryData(queryKeys.ledger(input.ledgerId), ledgerDto)");
    expect(bootstrap).toContain("queryKeys.entryCategories(input.ledgerId)");
    expect(client).toContain("queryKey: queryKeys.ledger(ledgerId)");
    expect(client).toContain("queryKey: queryKeys.entryCategories(ledgerId)");
  });
});

afterAll(async () => {
  await recordPerformanceFindings([
    {
      id: "server-page-auth-call-count",
      category: "structural",
      evidenceClass: "confirmed-structural",
      title: "Page source has one direct auth call",
      summary: "The protected page invokes auth() once; deeper current-user and ledger-context duplication is not observed through this source-level seam.",
      location: "tests/performance/server-boundaries.test.ts",
    },
    {
      id: "server-stream-bootstrap-parallel-start",
      category: "structural",
      evidenceClass: "confirmed-structural",
      title: "Active stream bootstrap operations start in parallel",
      summary: "Categories, attention, counts, first completed page, and summary queries are invoked before any deferred query resolves.",
      location: "tests/performance/server-boundaries.test.ts",
    },
    {
      id: "server-hydration-query-boundary",
      category: "structural",
      evidenceClass: "confirmed-structural",
      title: "Hydrated ledger and category query keys have client query functions",
      summary: "Server bootstrap hydrates ledger/category keys and the client declares matching useQuery functions; duplicate network invocation is not asserted without a browser request trace.",
      location: "tests/performance/server-boundaries.test.ts",
    },
  ]);
});
