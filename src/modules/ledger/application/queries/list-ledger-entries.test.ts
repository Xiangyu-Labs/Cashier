import { describe, expect, it, vi } from "vitest";

const listLedgerEntryPageMock = vi.hoisted(() => vi.fn());

vi.mock("./list-ledger-entry-page", () => ({
  listLedgerEntryPage: listLedgerEntryPageMock,
}));

import { listLedgerEntries } from "./list-ledger-entries";

describe("listLedgerEntries", () => {
  it("validates params, builds filters, and normalizes nextCursor to null", async () => {
    listLedgerEntryPageMock.mockResolvedValueOnce({
      items: [{ id: "entry-1" }],
      nextCursor: undefined,
    });

    const result = await listLedgerEntries("ledger-1", {
      limit: 20,
      cursor: undefined,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "11111111-1111-4111-8111-111111111111",
      currency: "USD",
      minAmount: 10,
      maxAmount: 50,
    });

    expect(listLedgerEntryPageMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      limit: 20,
      cursor: null,
      filters: {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        categoryId: "11111111-1111-4111-8111-111111111111",
        currency: "USD",
        minAmount: 10,
        maxAmount: 50,
      },
    });
    expect(result).toEqual({
      items: [{ id: "entry-1" }],
      nextCursor: null,
    });
  });

  it("throws validation errors for invalid params", async () => {
    await expect(
      listLedgerEntries("ledger-1", {
        limit: 0,
      })
    ).rejects.toThrow("Too small");
  });
});
