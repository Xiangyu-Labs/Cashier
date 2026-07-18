import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { postgresLedgerProjectionAdapter } from "@/application/adapters/postgres";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { hasActiveEntries } from "@/modules/ledger/application/queries/has-active-entries";
import { currencyRates, ledgers, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

describe("target Settings currency workflow", () => {
  let ledgerId = "";
  let sourceDocumentId: string;

  async function createEntry() {
    const result = await postgresLedgerProjectionAdapter.createManual({
      ledgerId,
      entryDate: "2026-07-15",
      entries: [
        {
          id: crypto.randomUUID(),
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
    sourceDocumentId = result.sourceDocumentId;
  }

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(db));
    await db.insert(currencyRates).values({
      date: "2026-07-15",
      base: "EUR",
      rates: { CNY: 8, USD: 1 },
    });
  });

  it("allows main currency change on empty ledger", async () => {
    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    expect(updated.metadata?.settings?.mainCurrency).toBe("USD");
  });

  it("rejects main currency change when active entries exist", async () => {
    await createEntry();

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "USD" } })
    ).rejects.toThrow("Main currency cannot be changed after the first entry");
  });

  it("allows other setting changes when main currency is locked", async () => {
    await createEntry();

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { aiLanguage: "en" },
    });
    expect(updated.metadata?.settings?.aiLanguage).toBe("en");
    // mainCurrency is not in the initial empty settings, so remains undefined
    expect(updated.metadata?.settings?.mainCurrency).toBeUndefined();
  });

  it("hasActiveEntries returns false for empty ledger", async () => {
    expect(await hasActiveEntries(ledgerId)).toBe(false);
  });

  it("hasActiveEntries returns true after entry creation", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId)).toBe(true);
  });

  it("hasActiveEntries returns false after source document is soft-deleted", async () => {
    await createEntry();
    expect(await hasActiveEntries(ledgerId)).toBe(true);

    // Soft-delete the source document so its entries are no longer active
    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    expect(await hasActiveEntries(ledgerId)).toBe(false);
  });

  it("allows main currency change after source document is soft-deleted", async () => {
    await createEntry();

    const db = getTestDb();
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDocumentId));

    const updated = await updateLedger(TEST_USER_ID, ledgerId, {
      settings: { mainCurrency: "USD" },
    });
    expect(updated.metadata?.settings?.mainCurrency).toBe("USD");
  });

  it("rejects main currency change with unsupported currency when active entries exist", async () => {
    await createEntry();

    await expect(
      updateLedger(TEST_USER_ID, ledgerId, { settings: { mainCurrency: "ZZZ" } })
    ).rejects.toThrow("Main currency cannot be changed after the first entry");
  });
});
