import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../setup";
import { exchangeRateRecalculationJobs, ledgers, users } from "@/persistence";
import {
  initializeExchangeRateLedgerRecalculationOrchestration,
  onExchangeRatesStored,
  runBoundedExchangeRateRecalculation,
} from "@/application/orchestration/exchange-rate-ledger-recalculation";
import {
  claimExchangeRateRecalculations,
  completeExchangeRateRecalculation,
  enqueueExchangeRateRecalculations,
  failExchangeRateRecalculation,
} from "@/application/adapters/postgres/exchange-rate-recalculation-jobs";
import { runBoundedMaintenance } from "@/application/adapters/postgres/maintenance";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";
import { ExchangeRateService } from "@/application/adapters/postgres/exchange-rate";

const deleteObject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/s3", () => ({
  getS3Storage: () => ({ delete: deleteObject }),
}));

const { recalculateEntriesConvertedAmountMock } = vi.hoisted(() => ({
  recalculateEntriesConvertedAmountMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/ledger/application/services/recalculate-entries-converted-amount", () => ({
  recalculateEntriesConvertedAmount: recalculateEntriesConvertedAmountMock,
}));

async function insertLedger(db: ReturnType<typeof getTestDb>, mainCurrency = "CNY") {
  const userId = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();
  await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  await db.insert(ledgers).values({ id: ledgerId, userId, mainCurrency });
  return ledgerId;
}

describe("exchange-rate ledger recalculation orchestration", () => {
  beforeEach(async () => {
    recalculateEntriesConvertedAmountMock.mockReset().mockResolvedValue(undefined);
    deleteObject.mockReset().mockResolvedValue({ success: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues one job per active ledger and recalculates each", async () => {
    const db = getTestDb();
    const ledger1Id = await insertLedger(db, "USD");
    const ledger2Id = await insertLedger(db);
    const deletedLedgerId = await insertLedger(db, "EUR");
    await db.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, deletedLedgerId));

    await onExchangeRatesStored({ date: "2024-02-10", base: "EUR", rates: {} });

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(2);
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(
      ledger1Id,
      "USD",
      expect.any(Object)
    );
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(
      ledger2Id,
      "CNY",
      expect.any(Object)
    );
    expect(await db.query.exchangeRateRecalculationJobs.findMany()).toEqual([]);
  });

  it("does not enqueue deleted ledgers", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db);
    const deletedLedgerId = await insertLedger(db);
    await db.update(ledgers).set({ deletedAt: new Date() }).where(eq(ledgers.id, deletedLedgerId));

    await expect(enqueueExchangeRateRecalculations("2024-02-11")).resolves.toBe(1);
    const rows = await db.query.exchangeRateRecalculationJobs.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rateDate: "2024-02-11", ledgerId, status: "pending" });
  });

  it("processes only one bounded batch of 25 jobs per run", async () => {
    const db = getTestDb();
    for (let index = 0; index < 30; index += 1) {
      await insertLedger(db);
    }

    await expect(enqueueExchangeRateRecalculations("2024-02-12")).resolves.toBe(30);
    await runBoundedExchangeRateRecalculation();

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(25);
    const remaining = await db.query.exchangeRateRecalculationJobs.findMany({
      where: eq(exchangeRateRecalculationJobs.status, "pending"),
    });
    expect(remaining).toHaveLength(5);

    await runBoundedExchangeRateRecalculation();
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(30);
    expect(await db.query.exchangeRateRecalculationJobs.findMany()).toEqual([]);
  });

  it("lets concurrent workers claim disjoint jobs", async () => {
    const db = getTestDb();
    await insertLedger(db);
    await insertLedger(db);
    await enqueueExchangeRateRecalculations("2024-02-13");
    const now = new Date();

    const [first, second] = await Promise.all([
      claimExchangeRateRecalculations({ now, limit: 25, leaseMs: 300_000 }),
      claimExchangeRateRecalculations({ now, limit: 25, leaseMs: 300_000 }),
    ]);

    const claimedLedgerIds = new Set([...first, ...second].map((job) => job.ledgerId));
    expect(first.length + second.length).toBe(2);
    expect(claimedLedgerIds.size).toBe(2);
  });

  it("reclaims an expired claim and fences the old token", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db);
    await enqueueExchangeRateRecalculations("2024-02-14");
    const start = new Date();

    const first = await claimExchangeRateRecalculations({
      now: start,
      limit: 25,
      leaseMs: 300_000,
    });
    expect(first).toHaveLength(1);

    const expired = await claimExchangeRateRecalculations({
      now: new Date(start.getTime() + 300_001),
      limit: 25,
      leaseMs: 300_000,
    });
    expect(expired).toHaveLength(1);
    expect(expired[0]!.ledgerId).toBe(ledgerId);
    expect(expired[0]!.claimToken).not.toBe(first[0]!.claimToken);

    await expect(
      completeExchangeRateRecalculation({
        rateDate: "2024-02-14",
        ledgerId,
        claimToken: first[0]!.claimToken,
      })
    ).resolves.toBe(false);
    await expect(
      completeExchangeRateRecalculation({
        rateDate: "2024-02-14",
        ledgerId,
        claimToken: expired[0]!.claimToken,
      })
    ).resolves.toBe(true);
    expect(await db.query.exchangeRateRecalculationJobs.findMany()).toEqual([]);
  });

  it("backs off failed jobs and permanently fails after eight attempts", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db);
    await enqueueExchangeRateRecalculations("2024-02-15");
    let now = new Date();

    let job = (await claimExchangeRateRecalculations({ now, limit: 25, leaseMs: 300_000 }))[0]!;
    expect(job).toMatchObject({ rateDate: "2024-02-15", ledgerId, attempts: 0 });

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const outcome = await failExchangeRateRecalculation({
        rateDate: job.rateDate,
        ledgerId: job.ledgerId,
        claimToken: job.claimToken,
        now,
        errorCode: "RecalculationFailed",
      });
      if (attempt < 8) {
        expect(outcome).toBe("retry_scheduled");
        const row = await db.query.exchangeRateRecalculationJobs.findFirst({
          where: eq(exchangeRateRecalculationJobs.ledgerId, ledgerId),
        });
        expect(row).toMatchObject({
          status: "pending",
          attempts: attempt,
          lastError: "RecalculationFailed",
        });
        if (attempt === 1) {
          expect(row!.nextAttemptAt.getTime()).toBe(now.getTime() + 10_000);
        }
        now = new Date(row!.nextAttemptAt.getTime());
        job = (await claimExchangeRateRecalculations({ now, limit: 25, leaseMs: 300_000 }))[0]!;
      } else {
        expect(outcome).toBe("permanently_failed");
      }
    }

    const finalRow = await db.query.exchangeRateRecalculationJobs.findFirst({
      where: eq(exchangeRateRecalculationJobs.ledgerId, ledgerId),
    });
    expect(finalRow).toMatchObject({ status: "failed", attempts: 8 });
  });

  it("recovers pending jobs through bounded maintenance", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db);
    await enqueueExchangeRateRecalculations("2024-02-16");

    const now = new Date();
    await runBoundedMaintenance(now);

    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(
      ledgerId,
      "CNY",
      expect.any(Object)
    );
    expect(await db.query.exchangeRateRecalculationJobs.findMany()).toEqual([]);
  });

  it("triggers recalculation only when rates are first stored after orchestration is initialized", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db);

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
    const firstConversion = convertAmountsBatch(
      [{ amount: "1", fromCurrency: "USD", date: "2024-02-10" }],
      "CNY",
      ExchangeRateService
    ).then((result) => {
      firstConversionSettled = true;
      return result;
    });

    await vi.waitFor(() => {
      expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledTimes(1);
      expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(
        ledgerId,
        "CNY",
        expect.any(Object)
      );
    });
    expect(firstConversionSettled).toBe(false);

    if (releaseRecalculation == null) {
      throw new Error("Expected a deferred recalculation resolver");
    }
    releaseRecalculation();
    await firstConversion;
    expect(firstConversionSettled).toBe(true);
    expect(await db.query.exchangeRateRecalculationJobs.findMany()).toEqual([]);

    recalculateEntriesConvertedAmountMock.mockClear();

    await convertAmountsBatch(
      [{ amount: "1", fromCurrency: "USD", date: "2024-02-10" }],
      "CNY",
      ExchangeRateService
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountMock).not.toHaveBeenCalled();
  });

  it("does not fail orchestration when a single recalculation throws", async () => {
    const db = getTestDb();
    const ledgerId = await insertLedger(db, "JPY");

    recalculateEntriesConvertedAmountMock.mockImplementation(async (id: string) => {
      if (id === ledgerId) {
        throw new Error("test recalculation error");
      }
    });

    await expect(
      onExchangeRatesStored({ date: "2024-02-17", base: "EUR", rates: {} })
    ).resolves.toBeUndefined();
    expect(recalculateEntriesConvertedAmountMock).toHaveBeenCalledWith(
      ledgerId,
      "JPY",
      expect.any(Object)
    );

    const persisted = await db.query.exchangeRateRecalculationJobs.findFirst({
      where: eq(exchangeRateRecalculationJobs.ledgerId, ledgerId),
    });
    expect(persisted).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "Error",
    });
    expect(await db.query.ledgers.findFirst({ where: eq(ledgers.id, ledgerId) })).toBeDefined();
  });
});
