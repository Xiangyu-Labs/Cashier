import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../setup";
import { ledgers, users } from "@/persistence";
import {
  initializeExchangeRateLedgerRecalculationOrchestration,
  onExchangeRatesStored,
} from "@/lib/orchestration/exchange-rate-ledger-recalculation";
import { batchConvertCurrencyAction } from "@/modules/currency/actions";

const { recalculateEntriesConvertedAmountMock } = vi.hoisted(() => ({
  recalculateEntriesConvertedAmountMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/ledger/use-cases", () => ({
  recalculateEntriesConvertedAmount: recalculateEntriesConvertedAmountMock,
}));

describe("exchange-rate ledger recalculation orchestration", () => {
  let counter = 0;

  beforeEach(async () => {
    counter++;
    recalculateEntriesConvertedAmountMock.mockReset().mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recalculates for all active ledgers and uses CNY fallback", async () => {
    const db = getTestDb();
    const user1Id = `user-1-${counter}`;
    const user2Id = `user-2-${counter}`;
    const user3Id = `user-3-${counter}`;
    const ledger1Id = `ledger-1-${counter}`;
    const ledger2Id = `ledger-2-${counter}`;
    const deletedLedgerId = `ledger-deleted-${counter}`;

    await db.insert(users).values({ id: user1Id, email: `${user1Id}@example.com` });
    await db.insert(users).values({ id: user2Id, email: `${user2Id}@example.com` });
    await db.insert(users).values({ id: user3Id, email: `${user3Id}@example.com` });

    await db.insert(ledgers).values({
      id: ledger1Id,
      userId: user1Id,
      metadata: { settings: { mainCurrency: "USD" } },
    });
    await db.insert(ledgers).values({
      id: ledger2Id,
      userId: user2Id,
      metadata: {},
    });
    await db.insert(ledgers).values({
      id: deletedLedgerId,
      userId: user3Id,
      metadata: { settings: { mainCurrency: "EUR" } },
      deletedAt: new Date(),
    });

    await onExchangeRatesStored();

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(2);
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledger1Id, "USD");
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledger2Id, "CNY");
  });

  it("triggers recalculation only when rates are first stored after orchestration is initialized", async () => {
    const db = getTestDb();
    const userId = `user-cache-${counter}`;
    const ledgerId = `ledger-${counter}`;

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
    await db.insert(ledgers).values({
      id: ledgerId,
      userId,
      metadata: { settings: { mainCurrency: "CNY" } },
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-02-10",
        rates: { USD: 1.08, CNY: 7.65 },
      }),
    } as Response);

    initializeExchangeRateLedgerRecalculationOrchestration();

    await batchConvertCurrencyAction([{ amount: 1, currency: "USD", date: "2024-02-10" }], "CNY");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledgerId, "CNY");

    recalculateEntriesConvertedAmountMock.mockClear();

    await batchConvertCurrencyAction([{ amount: 1, currency: "USD", date: "2024-02-10" }], "CNY");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountMock).not.toHaveBeenCalled();
  });

  it("does not fail orchestration when a single recalculation throws", async () => {
    const db = getTestDb();
    const userId = `user-error-${counter}`;
    const ledgerId = `ledger-error-${counter}`;

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
    await db.insert(ledgers).values({
      id: ledgerId,
      userId,
      metadata: { settings: { mainCurrency: "JPY" } },
    });

    recalculateEntriesConvertedAmountMock.mockImplementation(async (id: string) => {
      if (id === ledgerId) {
        throw new Error("test recalculation error");
      }
    });

    await expect(onExchangeRatesStored()).resolves.toBeUndefined();
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledgerId, "JPY");

    const persisted = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(persisted).toBeDefined();
  });
});
