import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { getLedgerEntryDetail } from "@/modules/ledger/application/queries/get-ledger-entry-detail";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { currencyRates, ledgerEntries, ledgers } from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

describe("target Settings currency workflow", () => {
  let ledgerId = "";
  let entryId = "";

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(db));
    entryId = crypto.randomUUID();
    await db.insert(currencyRates).values({
      date: "2026-07-15",
      base: "EUR",
      rates: { CNY: 8, USD: 1 },
    });
    await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [
        {
          id: entryId,
          categoryId: null,
          amount: "80.00",
          currency: "CNY",
          itemName: "Atomic currency entry",
          description: null,
          convertedAmount: "80.00",
          exchangeRate: "1.000000",
        },
      ],
    });
  });

  it("updates settings and all active read projections atomically", async () => {
    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    expect(updated.metadata?.settings?.mainCurrency).toBe("USD");

    const detail = await getLedgerEntryDetail(entryId, ledgerId);
    expect(detail).toMatchObject({ convertedAmount: "10.00", exchangeRate: "0.125000" });

    const stats = await calculateLedgerStats(
      ledgerId,
      "2026-07-01",
      "2026-07-31",
      "USD"
    );
    expect(stats.convertedTotal).toEqual({ total: "10", currency: "USD" });
  });

  it("rolls back both settings and projections when conversion facts are unavailable", async () => {
    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "ZZZ" } })
    ).rejects.toThrow("Unsupported currency conversion");

    const db = getTestDb();
    const ledger = await db.query.ledgers.findFirst({ where: eq(ledgers.id, ledgerId) });
    const entry = await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.id, entryId) });
    expect(ledger?.metadata?.settings?.mainCurrency).not.toBe("ZZZ");
    expect(entry).toMatchObject({ convertedAmount: "80.00", exchangeRate: "1.000000" });
  });
});
