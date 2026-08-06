import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../setup";
import {
  currencyRates,
  ledgerEntries,
  ledgers,
  sourceDocumentRevisions,
  sourceDocuments,
  users,
} from "@/persistence";
import { postgresCurrencyAdapter } from "@/application/adapters/postgres";
import {
  initializeExchangeRateLedgerRecalculationOrchestration,
  onExchangeRatesStored,
} from "@/lib/orchestration/exchange-rate-ledger-recalculation";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";
import { ExchangeRateService } from "@/application/adapters/postgres/exchange-rate";

const { recalculateEntriesConvertedAmountForDateMock } = vi.hoisted(() => ({
  recalculateEntriesConvertedAmountForDateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/ledger/application/services/recalculate-entries-converted-amount", () => ({
  recalculateEntriesConvertedAmount: vi.fn(),
  recalculateEntriesConvertedAmountForDate: recalculateEntriesConvertedAmountForDateMock,
}));

describe("exchange-rate ledger recalculation orchestration", () => {
  beforeEach(async () => {
    recalculateEntriesConvertedAmountForDateMock.mockReset().mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedLedgerWithEntry(input: {
    mainCurrency?: string;
    entryDate: string | null;
    deleted?: boolean;
    pendingOnly?: boolean;
  }) {
    const db = getTestDb();
    const userId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const sourceDocumentId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
    await db.insert(ledgers).values({
      id: ledgerId,
      userId,
      ...(input.mainCurrency != null ? { mainCurrency: input.mainCurrency } : {}),
      ...(input.deleted === true ? { deletedAt: new Date() } : {}),
    });
    await db.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ledgerId,
      entryDate: input.entryDate,
      ...(input.deleted === true ? { deletedAt: new Date() } : {}),
    });
    await db.insert(sourceDocumentRevisions).values({
      id: revisionId,
      ledgerId,
      sourceDocumentId,
      revisionNumber: 1,
    });
    await db
      .update(sourceDocuments)
      .set(
        input.pendingOnly === true
          ? { pendingRevisionId: revisionId }
          : { activeRevisionId: revisionId }
      )
      .where(eq(sourceDocuments.id, sourceDocumentId));
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId,
      sourceDocumentRevisionId: revisionId,
      amount: "100.00",
      currency: "USD",
      itemName: "Rate event item",
    });
    return ledgerId;
  }

  it("recalculates only ledgers with active/pending entries on the event date", async () => {
    const eventDate = "2026-02-10";
    const ledgerWithEntries = await seedLedgerWithEntry({
      mainCurrency: "USD",
      entryDate: eventDate,
    });
    const ledgerWithPendingEntry = await seedLedgerWithEntry({
      entryDate: eventDate,
      pendingOnly: true,
    });
    const ledgerOnOtherDate = await seedLedgerWithEntry({ entryDate: "2026-02-09" });
    const deletedLedger = await seedLedgerWithEntry({
      mainCurrency: "EUR",
      entryDate: eventDate,
      deleted: true,
    });

    await onExchangeRatesStored({
      date: eventDate,
      base: "EUR",
      rates: { USD: 1.08 },
    });

    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledTimes(2);
    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
      ledgerWithEntries,
      "USD",
      eventDate,
      expect.any(Object)
    );
    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
      ledgerWithPendingEntry,
      "CNY",
      eventDate,
      expect.any(Object)
    );
    expect(recalculateEntriesConvertedAmountForDateMock).not.toHaveBeenCalledWith(
      ledgerOnOtherDate,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(recalculateEntriesConvertedAmountForDateMock).not.toHaveBeenCalledWith(
      deletedLedger,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it("recalculates ledgers with undated entries when rates are stored", async () => {
    const eventDate = "2026-05-01";
    const ledgerWithUndatedEntry = await seedLedgerWithEntry({
      mainCurrency: "USD",
      entryDate: null,
    });
    const ledgerOnOtherDate = await seedLedgerWithEntry({ entryDate: "2026-04-30" });

    await onExchangeRatesStored({
      date: eventDate,
      base: "EUR",
      rates: { USD: 1.08 },
    });

    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
      ledgerWithUndatedEntry,
      "USD",
      eventDate,
      expect.any(Object)
    );
    expect(recalculateEntriesConvertedAmountForDateMock).not.toHaveBeenCalledWith(
      ledgerOnOtherDate,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it("does not wait for ledger recalculation when rates are first stored", async () => {
    await seedLedgerWithEntry({ mainCurrency: "CNY", entryDate: "2024-02-10" });

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
    recalculateEntriesConvertedAmountForDateMock.mockReturnValue(recalculationGate);

    initializeExchangeRateLedgerRecalculationOrchestration();

    let firstConversionSettled = false;
    const firstConversion = convertAmountsBatch(
      [{ amount: "1", fromCurrency: "USD", date: "2024-02-10" }],
      "CNY",
      ExchangeRateService
    )
      .then((result) => {
        firstConversionSettled = true;
        return result;
      })
      .catch(() => {
        firstConversionSettled = true;
      });

    await vi.waitFor(() => {
      expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledTimes(1);
      expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
        expect.any(String),
        "CNY",
        "2024-02-10",
        expect.any(Object)
      );
    });
    // The conversion must not wait for the ledger recalculation anymore.
    await vi.waitFor(() => expect(firstConversionSettled).toBe(true));
    await firstConversion;

    if (releaseRecalculation == null) {
      throw new Error("Expected a deferred recalculation resolver");
    }
    releaseRecalculation();

    recalculateEntriesConvertedAmountForDateMock.mockClear();

    await convertAmountsBatch(
      [{ amount: "1", fromCurrency: "USD", date: "2024-02-10" }],
      "CNY",
      ExchangeRateService
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recalculateEntriesConvertedAmountForDateMock).not.toHaveBeenCalled();
  });

  it("does not fail orchestration when a single recalculation throws", async () => {
    const db = getTestDb();
    const userId = crypto.randomUUID();
    const secondUserId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const secondLedgerId = crypto.randomUUID();
    const sourceDocumentId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const secondSourceDocumentId = crypto.randomUUID();
    const secondRevisionId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
    await db.insert(users).values({
      id: secondUserId,
      email: `${secondUserId}@example.com`,
    });
    await db.insert(ledgers).values([
      { id: ledgerId, userId, mainCurrency: "JPY" },
      { id: secondLedgerId, userId: secondUserId, mainCurrency: "USD" },
    ]);
    await db.insert(sourceDocuments).values([
      {
        id: sourceDocumentId,
        ledgerId,
        entryDate: "2026-03-01",
      },
      {
        id: secondSourceDocumentId,
        ledgerId: secondLedgerId,
        entryDate: "2026-03-01",
      },
    ]);
    await db.insert(sourceDocumentRevisions).values([
      {
        id: revisionId,
        ledgerId,
        sourceDocumentId,
        revisionNumber: 1,
      },
      {
        id: secondRevisionId,
        ledgerId: secondLedgerId,
        sourceDocumentId: secondSourceDocumentId,
        revisionNumber: 1,
      },
    ]);
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId: revisionId })
      .where(eq(sourceDocuments.id, sourceDocumentId));
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId: secondRevisionId })
      .where(eq(sourceDocuments.id, secondSourceDocumentId));
    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId,
        sourceDocumentRevisionId: revisionId,
        amount: "10.00",
        currency: "USD",
        itemName: "A",
      },
      {
        ledgerId: secondLedgerId,
        sourceDocumentId: secondSourceDocumentId,
        sourceDocumentRevisionId: secondRevisionId,
        amount: "20.00",
        currency: "USD",
        itemName: "B",
      },
    ]);

    recalculateEntriesConvertedAmountForDateMock.mockImplementation(async (id: string) => {
      if (id === ledgerId) {
        throw new Error("test recalculation error");
      }
    });

    await expect(
      onExchangeRatesStored({
        date: "2026-03-01",
        base: "EUR",
        rates: { USD: 1.08 },
      })
    ).resolves.toBeUndefined();
    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
      ledgerId,
      "JPY",
      "2026-03-01",
      expect.any(Object)
    );
    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledWith(
      secondLedgerId,
      "USD",
      "2026-03-01",
      expect.any(Object)
    );

    const persisted = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(persisted).toBeDefined();
  });

  it("bounds recalculation concurrency to five and covers all ledgers", async () => {
    const eventDate = "2026-04-01";
    const ledgerIds = await Promise.all(
      Array.from({ length: 7 }, () => seedLedgerWithEntry({ entryDate: eventDate }))
    );

    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    recalculateEntriesConvertedAmountForDateMock.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
    });

    const pending = onExchangeRatesStored({
      date: eventDate,
      base: "EUR",
      rates: { USD: 1.08 },
    });

    await vi.waitFor(() => {
      expect(maxActive).toBeGreaterThanOrEqual(5);
    });
    expect(maxActive).toBeLessThanOrEqual(5);

    release();
    await pending;

    expect(recalculateEntriesConvertedAmountForDateMock).toHaveBeenCalledTimes(ledgerIds.length);
  });

  it("recalculates dated and undated entries with recalculateLedgerForDate", async () => {
    const db = getTestDb();
    const userId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const datedSourceDocumentId = crypto.randomUUID();
    const undatedSourceDocumentId = crypto.randomUUID();
    const datedRevisionId = crypto.randomUUID();
    const undatedRevisionId = crypto.randomUUID();

    await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
    await db.insert(ledgers).values({ id: ledgerId, userId, mainCurrency: "CNY" });

    // Older rates first: undated entries must use the newest stored date.
    await db.insert(currencyRates).values({
      date: "2026-05-01",
      base: "EUR",
      rates: { USD: 1.0, CNY: 7.0 },
    });
    await db.insert(currencyRates).values({
      date: "2026-06-01",
      base: "EUR",
      rates: { USD: 1.08, CNY: 7.65 },
    });

    await db.insert(sourceDocuments).values([
      { id: datedSourceDocumentId, ledgerId, entryDate: "2026-06-01" },
      { id: undatedSourceDocumentId, ledgerId, entryDate: null },
    ]);
    await db.insert(sourceDocumentRevisions).values([
      {
        id: datedRevisionId,
        ledgerId,
        sourceDocumentId: datedSourceDocumentId,
        revisionNumber: 1,
      },
      {
        id: undatedRevisionId,
        ledgerId,
        sourceDocumentId: undatedSourceDocumentId,
        revisionNumber: 1,
      },
    ]);
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId: datedRevisionId })
      .where(eq(sourceDocuments.id, datedSourceDocumentId));
    await db
      .update(sourceDocuments)
      .set({ activeRevisionId: undatedRevisionId })
      .where(eq(sourceDocuments.id, undatedSourceDocumentId));
    await db.insert(ledgerEntries).values([
      {
        ledgerId,
        sourceDocumentId: datedSourceDocumentId,
        sourceDocumentRevisionId: datedRevisionId,
        amount: "100.00",
        currency: "USD",
        itemName: "Dated",
        convertedAmount: "0.00",
        exchangeRate: "0.000000",
      },
      {
        ledgerId,
        sourceDocumentId: undatedSourceDocumentId,
        sourceDocumentRevisionId: undatedRevisionId,
        amount: "200.00",
        currency: "USD",
        itemName: "Undated",
        convertedAmount: "0.00",
        exchangeRate: "0.000000",
      },
    ]);

    await postgresCurrencyAdapter.recalculateLedgerForDate(ledgerId, "CNY", "2026-06-01");

    const entries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.ledgerId, ledgerId),
    });
    const byName = new Map(entries.map((entry) => [entry.itemName, entry]));

    // 100 USD * (7.65 / 1.08) = 708.33 CNY
    expect(byName.get("Dated")?.convertedAmount).toBe("708.33");
    expect(byName.get("Dated")?.exchangeRate).toBe("7.083333");
    // Undated entries use the latest stored rate (2026-06-01), not 7.0.
    expect(byName.get("Undated")?.convertedAmount).toBe("1416.67");
    expect(byName.get("Undated")?.exchangeRate).toBe("7.083333");
  });
});
