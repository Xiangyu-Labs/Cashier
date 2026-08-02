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

vi.mock("@/modules/ledger/application/services/recalculate-entries-converted-amount", () => ({
  recalculateEntriesConvertedAmount: recalculateEntriesConvertedAmountMock,
}));

describe("exchange-rate ledger recalculation orchestration", () => {
  beforeEach(async () => {
    recalculateEntriesConvertedAmountMock.mockReset().mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recalculates for all active ledgers and uses CNY fallback", async () => {
    const db = getTestDb();
    const user1Id = crypto.randomUUID();
    const user2Id = crypto.randomUUID();
    const user3Id = crypto.randomUUID();
    const ledger1Id = crypto.randomUUID();
    const ledger2Id = crypto.randomUUID();
    const deletedLedgerId = crypto.randomUUID();

    await db.insert(users).values({ id: user1Id, email: `${user1Id}@example.com` });
    await db.insert(users).values({ id: user2Id, email: `${user2Id}@example.com` });
    await db.insert(users).values({ id: user3Id, email: `${user3Id}@example.com` });

    await db.insert(ledgers).values({
      id: ledger1Id,
      userId: user1Id,
      mainCurrency: "USD",
    });
    await db.insert(ledgers).values({
      id: ledger2Id,
      userId: user2Id,
    });
    await db.insert(ledgers).values({
      id: deletedLedgerId,
      userId: user3Id,
      mainCurrency: "EUR",
      deletedAt: new Date(),
    });

    await onExchangeRatesStored();

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(2);
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledger1Id, "USD");
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledger2Id, "CNY");
  });

  it("triggers recalculation only when rates are first stored after orchestration is initialized", async () => {
    const db = getTestDb();
    const userId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
    await db.insert(ledgers).values({
      id: ledgerId,
      userId,
      mainCurrency: "CNY",
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        base: "EUR",
        date: "2024-02-10",
        rates: { USD: 1.08, CNY: 7.65 },
      }),
    } as Response);

    let releaseRecalculation: (() => void) | undefined;
    const recalculationGate = new Promise<void>((resolve) => {
      releaseRecalculation = resolve;
    });
    recalculateEntriesConvertedAmountMock.mockReturnValueOnce(recalculationGate);

    initializeExchangeRateLedgerRecalculationOrchestration();

    let firstConversionSettled = false;
    const firstConversion = batchConvertCurrencyAction(
      [{ amount: 1, currency: "USD", date: "2024-02-10" }],
      "CNY"
    ).then((result) => {
      firstConversionSettled = true;
      return result;
    });

    await vi.waitFor(() => {
      expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(1);
      expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(ledgerId, "CNY");
    });
    expect(firstConversionSettled).toBe(false);

    if (releaseRecalculation == null) {
      throw new Error("Expected a deferred recalculation resolver");
    }
    releaseRecalculation();
    await firstConversion;
    expect(firstConversionSettled).toBe(true);

    recalculateEntriesConvertedAmountMock.mockClear();

    await batchConvertCurrencyAction([{ amount: 1, currency: "USD", date: "2024-02-10" }], "CNY");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountMock).not.toHaveBeenCalled();
  });

  it("does not fail orchestration when a single recalculation throws", async () => {
    const db = getTestDb();
    const userId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
    await db.insert(ledgers).values({
      id: ledgerId,
      userId,
      mainCurrency: "JPY",
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
