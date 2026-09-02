import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

const { getRatesMock, convertBatchMock } = vi.hoisted(() => ({
  getRatesMock: vi.fn(async () => ({
    base: "USD",
    date: "2026-01-01",
    rates: { CNY: 1 } as Record<string, number>,
  })),
  convertBatchMock: vi.fn(),
}));

vi.mock("@/application/adapters/postgres/exchange-rate", () => {
  const rateBook = {
    getRates: getRatesMock,
    convertBatch: convertBatchMock,
  };
  return { ExchangeRateService: rateBook, postgresFxRateBook: rateBook, fetchWithRetry: vi.fn() };
});
import { updateLedgerEntryAction } from "@/modules/ledger/actions";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

async function seedDoc(db: ReturnType<typeof getTestDb>, ledgerId: string, entryDate?: string) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      id: uuidv4(),
      ledgerId,
      currentStatus: "completed",
      type: "ai_parsed",
      entryDate: entryDate ?? null,
    })
    .returning();
  expect(doc).toBeDefined();
  if (doc === undefined) {
    throw new Error("Expected source document insert to return a row");
  }
  await activateTestSourceDocumentProjection(db, doc.id);
  return doc;
}

describe("updateLedgerEntryAction", () => {
  let ledgerId: string;
  let entryId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,

      mainCurrency: "CNY",
    });

    const doc = await seedDoc(db, ledgerId);
    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        id: uuidv4(),
        ledgerId,
        sourceDocumentId: doc.id,
        itemName: "午餐",
        amount: "50.00",
        currency: "CNY",
        convertedAmount: "50.00",
      })
      .returning();
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("Expected ledger entry insert to return a row");
    }
    entryId = entry.id;
    await activateTestSourceDocumentProjection(db, doc.id);
  });

  it("updates itemName without recalculating convertedAmount", async () => {
    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        itemName: "晚餐",
      },
      crypto.randomUUID()
    );
    expect(result.itemName).toBe("晚餐");
    expect(getRatesMock).not.toHaveBeenCalled();
  });

  it("recalculates convertedAmount when amount changes", async () => {
    getRatesMock.mockResolvedValue({ base: "USD", date: "2026-01-01", rates: { CNY: 2 } });

    const db = getTestDb();
    // Change currency to USD first
    await db.update(ledgerEntries).set({ currency: "USD" }).where(eq(ledgerEntries.id, entryId));

    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        amount: "100",
      },
      crypto.randomUUID()
    );

    expect(getRatesMock).toHaveBeenCalled();
    expect(result.convertedAmount).toBe("200.000");
  });

  it("re-rounds the amount when only currency changes", async () => {
    getRatesMock.mockResolvedValue({
      base: "USD",
      date: "2026-01-01",
      rates: { CNY: 1, JPY: 100 },
    });
    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      { currency: "JPY" },
      crypto.randomUUID()
    );

    expect(result.currency).toBe("JPY");
    expect(result.amount).toBe("50.000");
  });

  it("persists the ledger currency when an empty currency is submitted", async () => {
    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      { amount: "12.3456", currency: null },
      crypto.randomUUID()
    );

    expect(result.currency).toBe("CNY");
    expect(result.amount).toBe("12.350");
    expect(result.convertedAmount).toBe("12.350");
  });

  it("updates categoryId without conversion", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    const result = await updateLedgerEntryAction(
      ledgerId,
      entryId,
      {
        categoryId: catId,
      },
      crypto.randomUUID()
    );
    expect(result.categoryId).toBe(catId);
    expect(getRatesMock).not.toHaveBeenCalled();
  });
});
