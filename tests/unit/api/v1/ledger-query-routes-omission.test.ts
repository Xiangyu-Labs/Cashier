import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

const {
  handleApiV1RouteMock,
  parseApiInputMock,
  listLedgerEntriesMock,
  calculateLedgerStatsMock,
} = vi.hoisted(() => ({
  handleApiV1RouteMock: vi.fn(),
  parseApiInputMock: vi.fn(),
  listLedgerEntriesMock: vi.fn(),
  calculateLedgerStatsMock: vi.fn(),
}));

vi.mock("@/app/api/v1/_shared/route-helper", () => ({
  handleApiV1Route: handleApiV1RouteMock,
}));

vi.mock("@/app/api/v1/_shared/validation", () => ({
  parseApiInput: parseApiInputMock,
}));

vi.mock("@/modules/ledger/queries", () => ({
  listLedgerEntries: listLedgerEntriesMock,
  calculateLedgerStats: calculateLedgerStatsMock,
}));

import { GET as getEntries } from "@/app/api/v1/entries/route";
import { GET as getStats } from "@/app/api/v1/stats/route";

describe("api/v1 ledger query omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleApiV1RouteMock.mockImplementation(
      async (
        request: NextRequest,
        {
          handler,
        }: {
          handler: (ctx: {
            credential: { id: string; ledgerId: string };
            key: string;
            request: NextRequest;
          }) => Promise<NextResponse>;
        }
      ) =>
        handler({
          credential: { id: "cred-1", ledgerId: "ledger-1" },
          key: "test-key",
          request,
        })
    );
    parseApiInputMock.mockImplementation((_schema: unknown, raw: unknown) => raw);
    listLedgerEntriesMock.mockResolvedValue({ items: [], nextCursor: null });
    calculateLedgerStatsMock.mockResolvedValue({
      convertedTotal: 0,
      totals: [],
      trend: [],
      byCategory: [],
      byCurrency: [],
      hasMore: false,
      currentPeriodTotal: 0,
      previousPeriodTotal: 0,
      growth: { amount: 0, percent: 0 },
      entryCount: 0,
    });
  });

  it("omits absent optional fields in entries query payload", async () => {
    parseApiInputMock.mockReturnValueOnce({ limit: 10 });

    const request = new Request("http://localhost:3000/api/v1/entries?limit=10", {
      method: "GET",
    }) as unknown as NextRequest;

    await getEntries(request);

    const rawQueryInput = parseApiInputMock.mock.calls[0]?.[1] as Record<string, unknown>;
    const queryPayload = listLedgerEntriesMock.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(rawQueryInput.limit).toBe("10");
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "startDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "endDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "cursor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "minAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "maxAmount")).toBe(false);

    expect(queryPayload.limit).toBe(10);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "startDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "endDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "cursor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "minAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "maxAmount")).toBe(false);
  });

  it("passes minAmount and maxAmount through entries query payload", async () => {
    parseApiInputMock.mockReturnValueOnce({
      limit: 20,
      minAmount: 20,
      maxAmount: 100,
    });

    const request = new Request(
      "http://localhost:3000/api/v1/entries?limit=20&minAmount=20&maxAmount=100",
      {
        method: "GET",
      }
    ) as unknown as NextRequest;

    await getEntries(request);

    const rawQueryInput = parseApiInputMock.mock.calls[0]?.[1] as Record<string, unknown>;
    const queryPayload = listLedgerEntriesMock.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(rawQueryInput.limit).toBe("20");
    expect(rawQueryInput.minAmount).toBe("20");
    expect(rawQueryInput.maxAmount).toBe("100");
    expect(queryPayload.limit).toBe(20);
    expect(queryPayload.minAmount).toBe(20);
    expect(queryPayload.maxAmount).toBe(100);
  });

  it("omits absent optional fields in stats query parse input", async () => {
    parseApiInputMock.mockReturnValueOnce({});

    const request = new Request("http://localhost:3000/api/v1/stats", {
      method: "GET",
    }) as unknown as NextRequest;

    await getStats(request);

    const rawQueryInput = parseApiInputMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "startDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "endDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "categoryId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rawQueryInput, "currency")).toBe(false);
  });
});
