import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { ledgers, ledgerEntries, entryCategories, users } from "@/persistence";
import { sourceDocuments } from "@/persistence/schema/source-document";
import { v4 as uuidv4 } from "uuid";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { activateTestSourceDocumentProjection } from "../../helpers/schema-setup";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

async function seedEntry(
  db: ReturnType<typeof getTestDb>,
  ledgerId: string,
  opts: {
    amount: string;
    currency?: string;
    convertedAmount?: string;
    categoryId?: string;
    entryDate?: string;
  }
) {
  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      id: uuidv4(),
      ledgerId,
      currentStatus: "completed",
      type: "ai_parsed",
      entryDate: opts.entryDate ?? null,
    })
    .returning();
  expect(doc).toBeDefined();
  if (doc === undefined) {
    throw new Error("Expected source document insert to return a row");
  }

  await db.insert(ledgerEntries).values({
    id: uuidv4(),
    ledgerId,
    sourceDocumentId: doc.id,
    itemName: "Test Item",
    amount: opts.amount,
    currency: opts.currency ?? "CNY",
    convertedAmount: opts.convertedAmount ?? opts.amount,
    categoryId: opts.categoryId ?? null,
  });
  await activateTestSourceDocumentProjection(db, doc.id);

  return doc;
}

describe("getLedgerStatsAction", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    ledgerId = uuidv4();
    await db.insert(ledgers).values({
      id: ledgerId,
      userId: TEST_USER_ID,
      metadata: { settings: { mainCurrency: "CNY" } },
    });
  });

  it("returns zero values for empty ledger", async () => {
    const result = await getLedgerStatsAction(ledgerId);
    expect(result.totals).toHaveLength(0);
    expect(result.trend).toHaveLength(0);
    expect(result.convertedTotal).not.toBeNull();
    expect(result.convertedTotal?.total).toBe("0");
    expect(result.convertedTotal?.currency).toBe("CNY");
  });

  it("groups totals by currency", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY" });
    await seedEntry(db, ledgerId, { amount: "50.00", currency: "CNY" });
    await seedEntry(db, ledgerId, { amount: "20.00", currency: "USD" });

    const result = await getLedgerStatsAction(ledgerId);
    const cny = result.totals.find((t) => t.currency === "CNY");
    const usd = result.totals.find((t) => t.currency === "USD");

    expect(cny).toBeDefined();
    expect(cny!.total).toBe("150");
    expect(cny!.count).toBe(2);
    expect(usd).toBeDefined();
    expect(usd!.total).toBe("20");
    expect(usd!.count).toBe(1);
  });

  it("returns trend sorted by date", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "30.00", currency: "CNY", entryDate: "2024-01-03" });
    await seedEntry(db, ledgerId, { amount: "10.00", currency: "CNY", entryDate: "2024-01-01" });
    await seedEntry(db, ledgerId, { amount: "20.00", currency: "CNY", entryDate: "2024-01-02" });

    const result = await getLedgerStatsAction(ledgerId);
    expect(result.trend).toHaveLength(3);
    const firstTrend = result.trend[0];
    const secondTrend = result.trend[1];
    const thirdTrend = result.trend[2];
    expect(firstTrend).toBeDefined();
    expect(secondTrend).toBeDefined();
    expect(thirdTrend).toBeDefined();
    expect(firstTrend?.date).toBe("2024-01-01");
    expect(secondTrend?.date).toBe("2024-01-02");
    expect(thirdTrend?.date).toBe("2024-01-03");
  });

  it("filters by startDate using sourceDocument.entryDate", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY", entryDate: "2024-01-01" });
    await seedEntry(db, ledgerId, { amount: "200.00", currency: "CNY", entryDate: "2024-02-01" });
    await seedEntry(db, ledgerId, { amount: "300.00", currency: "CNY", entryDate: "2024-03-01" });

    const result = await getLedgerStatsAction(ledgerId, "2024-02-01");
    const cny = result.totals.find((t) => t.currency === "CNY");
    expect(cny!.count).toBe(2);
    expect(cny!.total).toBe("500");
  });

  it("filters by endDate using sourceDocument.entryDate", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY", entryDate: "2024-01-01" });
    await seedEntry(db, ledgerId, { amount: "200.00", currency: "CNY", entryDate: "2024-02-01" });
    await seedEntry(db, ledgerId, { amount: "300.00", currency: "CNY", entryDate: "2024-03-01" });

    const result = await getLedgerStatsAction(ledgerId, undefined, "2024-02-01");
    const cny = result.totals.find((t) => t.currency === "CNY");
    expect(cny!.count).toBe(2);
    expect(cny!.total).toBe("300");
  });

  it("filters by categoryId", async () => {
    const db = getTestDb();
    const catId = uuidv4();
    await db.insert(entryCategories).values({
      id: catId,
      ledgerId,
      name: "餐饮",
      sortOrder: 1,
    });

    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY", categoryId: catId });
    await seedEntry(db, ledgerId, { amount: "200.00", currency: "CNY" }); // no category

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, undefined, {
      categoryId: catId,
    });
    const cny = result.totals.find((t) => t.currency === "CNY");
    expect(cny!.count).toBe(1);
    expect(cny!.total).toBe("100");
  });

  it("filters by currency", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY" });
    await seedEntry(db, ledgerId, { amount: "50.00", currency: "USD" });

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, undefined, {
      currency: "USD",
    });
    expect(result.totals).toHaveLength(1);
    const firstTotal = result.totals[0];
    expect(firstTotal).toBeDefined();
    expect(firstTotal?.currency).toBe("USD");
  });

  it("filters by minAmount using convertedAmount", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "50.00", currency: "CNY", convertedAmount: "50.00" });
    await seedEntry(db, ledgerId, { amount: "200.00", currency: "CNY", convertedAmount: "200.00" });

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, undefined, {
      minAmount: 100,
    });
    const cny = result.totals.find((t) => t.currency === "CNY");
    expect(cny!.count).toBe(1);
    expect(cny!.total).toBe("200");
  });

  it("filters by maxAmount using convertedAmount", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "50.00", currency: "CNY", convertedAmount: "50.00" });
    await seedEntry(db, ledgerId, { amount: "200.00", currency: "CNY", convertedAmount: "200.00" });

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, undefined, {
      maxAmount: 100,
    });
    const cny = result.totals.find((t) => t.currency === "CNY");
    expect(cny!.count).toBe(1);
    expect(cny!.total).toBe("50");
  });

  it("uses stored convertedAmount for convertedTotal", async () => {
    const db = getTestDb();

    // Entry with pre-calculated convertedAmount (e.g., from AI processing)
    // 110 USD converted to 720 CNY
    await seedEntry(db, ledgerId, {
      amount: "110.00",
      currency: "USD",
      convertedAmount: "720.00", // Pre-converted amount
      entryDate: "2024-01-15",
    });

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, "CNY");
    expect(result.convertedTotal).not.toBeNull();
    expect(result.convertedTotal?.currency).toBe("CNY");
    expect(result.convertedTotal?.total).toBe("720");
  });

  it("single currency ledger: convertedTotal equals sum of amounts", async () => {
    const db = getTestDb();
    await seedEntry(db, ledgerId, { amount: "100.00", currency: "CNY" });
    await seedEntry(db, ledgerId, { amount: "50.00", currency: "CNY" });

    const result = await getLedgerStatsAction(ledgerId, undefined, undefined, "CNY");
    expect(result.convertedTotal).not.toBeNull();
    expect(result.convertedTotal?.total).toBe("150");
    expect(result.convertedTotal?.currency).toBe("CNY");
  });

  it("throws 'Unauthorized' when ledger belongs to another user", async () => {
    const db = getTestDb();

    await db
      .insert(users)
      .values({
        id: OTHER_USER_ID,
        email: "other@example.com",
        name: "Other User",
        emailVerified: new Date(),
      })
      .onConflictDoNothing();

    const otherLedgerId = uuidv4();
    await db.insert(ledgers).values({
      id: otherLedgerId,
      userId: OTHER_USER_ID,
      metadata: {},
    });

    await expect(getLedgerStatsAction(otherLedgerId)).rejects.toThrow("Ledger not found");
  });
});
