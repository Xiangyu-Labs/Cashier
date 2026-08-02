import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../setup";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
  TEST_USER_ID,
} from "../helpers/schema-setup";
import { ledgerEntries, ledgers, currencyRates, sourceDocuments } from "@/persistence";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { eq } from "drizzle-orm";

describe("Stats Currency Conversion", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const setup = await createTestUserWithLedger(db, undefined, "Converter Ledger", TEST_USER_ID);
    ledgerId = setup.ledgerId;

    // Set Main Currency to CNY
    await db
      .update(ledgers)
      .set({
        mainCurrency: "CNY",
      })
      .where(eq(ledgers.id, ledgerId));

    // Cleanup entries for this ledger
    await db.delete(ledgerEntries).where(eq(ledgerEntries.ledgerId, ledgerId));

    // Setup mock rates (Date: 2024-01-01)
    // Frankfurter base is usually EUR.
    // CNY = 7.8, USD = 1.08, MYR = 5.0
    // (Made up numbers for testing)
    await db
      .insert(currencyRates)
      .values({
        date: "2024-01-01",
        base: "EUR",
        rates: {
          CNY: 7.8,
          USD: 1.08,
          MYR: 5.0,
        },
      })
      .onConflictDoUpdate({
        target: currencyRates.date,
        set: { rates: { CNY: 7.8, USD: 1.08, MYR: 5.0 } },
      });
  });

  it("should convert multiple currencies to primary currency in stats", async () => {
    const db = getTestDb();

    // 1. Create source document with entryDate
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        entryDate: "2024-01-01",
        currentStatus: "completed",
      })
      .returning();
    expect(sourceDoc).toBeDefined();
    if (sourceDoc == null) {
      throw new Error("Expected source document to be created");
    }

    // 2. Insert an entry in MYR associated with source document
    // Using pre-calculated convertedAmount (156 CNY)
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: sourceDoc.id,
      amount: "100.00",
      currency: "MYR",
      convertedAmount: "156.00",
      itemName: "MYR Item",
    });
    await activateTestSourceDocumentProjection(db, sourceDoc.id);

    // 3. Call action
    const stats = await getLedgerStatsAction(ledgerId);

    // 4. Assert
    // convertedAmount is stored as 156.00 CNY
    expect(stats.convertedTotal?.currency).toBe("CNY");
    expect(stats.convertedTotal?.total).toBeCloseTo(156.0);
  });

  it("should aggregate multiple different currencies into main currency", async () => {
    const db = getTestDb();

    // 1. Create source document with entryDate
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        entryDate: "2024-01-01",
        currentStatus: "completed",
      })
      .returning();
    expect(sourceDoc).toBeDefined();
    if (sourceDoc == null) {
      throw new Error("Expected source document to be created");
    }

    // 2. Insert entries with pre-calculated convertedAmount
    // 100 MYR = 156 CNY
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: sourceDoc.id,
      amount: "100.00",
      currency: "MYR",
      convertedAmount: "156.00",
      itemName: "MYR Item",
    });

    // 50 USD = 361.11 CNY
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: sourceDoc.id,
      amount: "50.00",
      currency: "USD",
      convertedAmount: "361.11",
      itemName: "USD Item",
    });

    // 100 CNY = 100 CNY
    await db.insert(ledgerEntries).values({
      ledgerId,
      sourceDocumentId: sourceDoc.id,
      amount: "100.00",
      currency: "CNY",
      convertedAmount: "100.00",
      itemName: "CNY Item",
    });
    await activateTestSourceDocumentProjection(db, sourceDoc.id);

    // 3. Call action
    const stats = await getLedgerStatsAction(ledgerId);

    // 4. Assert
    // Total = 156 + 361.11 + 100 = 617.11
    expect(stats.convertedTotal?.currency).toBe("CNY");
    expect(stats.convertedTotal?.total).toBeCloseTo(617.11, 1);
  });
});
